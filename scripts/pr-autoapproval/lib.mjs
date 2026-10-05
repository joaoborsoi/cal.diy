// Pure, deterministic core of the PR auto-approval policy.
// No I/O, no clock, no network: the same (evidence, policy) always yields the
// same decision. Collection of evidence lives in collect-evidence.mjs.

import { createHash } from "node:crypto";

export const DECISION = { APPROVE: "auto-approve", MANUAL: "manual-review" };

// --- glob --------------------------------------------------------------------
// Supports `**` (any number of path segments), `*` and `?` (within a segment)
// and `{a,b}` alternatives. Patterns are anchored to the repo-relative path; a
// pattern without `**/` only matches at the repo root.

const REGEX_SPECIALS = /[.+^$()|[\]\\]/;

function globBody(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
    } else if (c === "*") {
      out += "[^/]*";
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) throw new Error(`unbalanced '{' in glob: ${glob}`);
      const alternatives = glob
        .slice(i + 1, end)
        .split(",")
        .map(globBody);
      out += `(?:${alternatives.join("|")})`;
      i = end;
    } else {
      out += REGEX_SPECIALS.test(c) ? `\\${c}` : c;
    }
  }
  return out;
}

const globCache = new Map();
export function globToRegExp(glob) {
  if (!globCache.has(glob)) globCache.set(glob, new RegExp(`^${globBody(glob)}$`));
  return globCache.get(glob);
}

export function matchesGlob(path, glob) {
  return globToRegExp(glob).test(path);
}

// --- hashing -----------------------------------------------------------------

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

// --- policy ------------------------------------------------------------------

export function validatePolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== "object") return ["policy is not an object"];
  if (typeof policy.id !== "string") errors.push("policy.id must be a string");
  if (!Number.isInteger(policy.version)) errors.push("policy.version must be an integer");
  if (!Number.isInteger(policy.max_changed_lines) || policy.max_changed_lines < 0)
    errors.push("policy.max_changed_lines must be a non-negative integer");
  const cls = policy.classification ?? {};
  for (const key of ["include", "exclude", "backend_content_markers"]) {
    if (!Array.isArray(cls[key]) || cls[key].some((g) => typeof g !== "string"))
      errors.push(`policy.classification.${key} must be an array of strings`);
  }
  if (errors.length === 0) {
    for (const g of [...cls.include, ...cls.exclude]) {
      try {
        globToRegExp(g);
      } catch (e) {
        errors.push(e.message);
      }
    }
    for (const m of cls.backend_content_markers) {
      try {
        new RegExp(m, "m");
      } catch (e) {
        errors.push(`invalid content marker ${m}: ${e.message}`);
      }
    }
  }
  return errors;
}

/** Markers (from policy) found in a file's content; used by the collector. */
export function findContentMarkers(content, policy) {
  return policy.classification.backend_content_markers.filter((m) => new RegExp(m, "m").test(content));
}

// --- classification ----------------------------------------------------------

/**
 * Classifies one changed file. Order: content markers > exclude > include >
 * default. Returns the first rule that decided, so every verdict is traceable.
 */
export function classifyFile(file, policy) {
  const { include, exclude } = policy.classification;
  if (file.content_markers?.length) {
    return { frontend: false, rule: `content-marker:${file.content_markers[0]}` };
  }
  const excluded = exclude.find((g) => matchesGlob(file.path, g));
  if (excluded) return { frontend: false, rule: `exclude:${excluded}` };
  const included = include.find((g) => matchesGlob(file.path, g));
  if (included) return { frontend: true, rule: `include:${included}` };
  return { frontend: false, rule: "default:no-include-matched" };
}

// --- evaluation --------------------------------------------------------------

export function evaluate(evidence, policy) {
  const policyErrors = validatePolicy(policy);
  if (policyErrors.length) throw new Error(`invalid policy: ${policyErrors.join("; ")}`);
  if (!evidence || !Array.isArray(evidence.files)) throw new Error("invalid evidence: missing files[]");
  // Content markers are detected at collection time using the policy's
  // patterns, so evidence is only valid for the exact policy it was built with.
  if (evidence.policy_sha256 && evidence.policy_sha256 !== sha256(policy)) {
    throw new Error("evidence was collected with a different policy; collect it again");
  }

  const files = [...evidence.files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => ({
      path: f.path,
      status: f.status,
      additions: f.binary ? null : f.additions,
      deletions: f.binary ? null : f.deletions,
      binary: Boolean(f.binary),
      content_markers: f.content_markers ?? [],
      ...classifyFile(f, policy),
    }));

  const additions = files.reduce((n, f) => n + (f.additions ?? 0), 0);
  const deletions = files.reduce((n, f) => n + (f.deletions ?? 0), 0);
  const changedLines = additions + deletions;
  const nonFrontend = files.filter((f) => !f.frontend);
  const binary = files.filter((f) => f.binary);

  const checks = [
    {
      id: "non-empty-diff",
      description: "The diff contains at least one changed file",
      passed: files.length > 0,
      details: `${files.length} changed file(s)`,
    },
    {
      id: "frontend-only",
      description: "Every changed file is frontend",
      passed: files.length > 0 && nonFrontend.length === 0,
      details: nonFrontend.length
        ? `non-frontend: ${nonFrontend.map((f) => `${f.path} (${f.rule})`).join(", ")}`
        : "all files classified as frontend",
    },
    {
      id: "measurable",
      description: "All changes are measurable in lines (no binaries)",
      passed: binary.length === 0,
      details: binary.length ? `binary: ${binary.map((f) => f.path).join(", ")}` : "no binary files",
    },
    {
      id: "max-changed-lines",
      description: `Changed lines (additions + deletions) <= ${policy.max_changed_lines}`,
      passed: binary.length === 0 && changedLines <= policy.max_changed_lines,
      details: `${changedLines} changed line(s) (+${additions} -${deletions}), limit ${policy.max_changed_lines}`,
    },
  ];

  return {
    policy: { id: policy.id, version: policy.version, sha256: sha256(policy) },
    evidence_sha256: sha256(evidence),
    subject: evidence.subject ?? null,
    decision: checks.every((c) => c.passed) ? DECISION.APPROVE : DECISION.MANUAL,
    checks,
    totals: {
      files: files.length,
      frontend_files: files.length - nonFrontend.length,
      additions,
      deletions,
      changed_lines: changedLines,
      limit: policy.max_changed_lines,
    },
    files,
  };
}

export function renderReport(result) {
  const s = result.subject ?? {};
  const ok = result.decision === DECISION.APPROVE;
  const lines = [
    `# PR auto-approval: ${ok ? "✅ AUTO-APPROVE" : "⛔ MANUAL REVIEW"}`,
    "",
    `- Policy: \`${result.policy.id}\` v${result.policy.version} (sha256 \`${result.policy.sha256.slice(0, 12)}\`)`,
    `- Evidence: sha256 \`${result.evidence_sha256.slice(0, 12)}\``,
    s.pr
      ? `- PR: ${s.repo}#${s.pr}${s.url ? ` (${s.url})` : ""}`
      : `- Local diff: \`${s.base_ref}\`...\`${s.head_ref}\``,
    `- Commits: base \`${(s.merge_base_sha ?? "").slice(0, 12)}\` → head \`${(s.head_sha ?? "").slice(0, 12)}\``,
    `- Totals: ${result.totals.files} file(s), ${result.totals.frontend_files} frontend, ${result.totals.changed_lines}/${result.totals.limit} lines (+${result.totals.additions} -${result.totals.deletions})`,
    "",
    "## Checks",
    "",
    "| Check | Result | Details |",
    "|---|---|---|",
    ...result.checks.map(
      (c) => `| ${c.description} | ${c.passed ? "pass" : "**fail**"} | ${c.details.replace(/\|/g, "\\|")} |`
    ),
    "",
    "## Files",
    "",
    "| File | Status | +/- | Frontend | Rule |",
    "|---|---|---|---|---|",
    ...result.files.map(
      (f) =>
        `| \`${f.path}\` | ${f.status} | ${f.binary ? "binary" : `+${f.additions} -${f.deletions}`} | ${f.frontend ? "yes" : "**no**"} | \`${f.rule}\` |`
    ),
    "",
  ];
  return lines.join("\n");
}
