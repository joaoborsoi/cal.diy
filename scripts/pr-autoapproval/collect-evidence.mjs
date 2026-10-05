#!/usr/bin/env node
// Collects the evidence the PR auto-approval policy is evaluated on: the list
// of changed files with line counts and content markers, pinned to exact
// commit SHAs. Output is deterministic for a given (base, head, policy): no
// timestamps, files sorted by path.
//
// Usage:
//   node scripts/pr-autoapproval/collect-evidence.mjs --pr <n> [--repo owner/repo] [options]
//   node scripts/pr-autoapproval/collect-evidence.mjs [--base <ref>] [--head <ref>] [options]
//
// Options:
//   --pr <n>          GitHub PR: metadata from the API, commits fetched from `origin`
//   --repo owner/repo Repo for --pr (default: inferred from the `origin` remote)
//   --base <ref>      Local mode base ref (default: main)
//   --head <ref>      Local mode head ref (default: HEAD)
//   --policy <file>   Policy file (default: policy.json next to this script)
//   --out <file>      Evidence JSON output (default: stdout)
//   --patch <file>    Also save the full diff here, for audit
//
// Env: GITHUB_TOKEN (optional; needed for private repos / higher rate limits)
// Exit codes: 0 = evidence written, 2 = error

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { findContentMarkers, sha256, validatePolicy } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(2);
}

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
}

function inferRepo() {
  const url = git(["remote", "get-url", "origin"]).trim();
  const repo = url.replace(/^(git@github\.com:|https:\/\/github\.com\/)/, "").replace(/\.git$/, "");
  if (!/^[^/]+\/[^/]+$/.test(repo)) die("couldn't infer repo from origin; pass --repo owner/repo");
  return repo;
}

async function githubGet(repo, path) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, { headers });
  if (!res.ok)
    die(`GitHub API ${path}: ${res.status} ${res.statusText} (set GITHUB_TOKEN for private repos)`);
  return res.json();
}

async function resolvePr(repo, number) {
  const pr = await githubGet(repo, `pulls/${number}`);
  const ns = `refs/pr-autoapproval/${number}`;
  git(
    [
      "fetch",
      "--quiet",
      "--no-tags",
      "origin",
      `+refs/pull/${number}/head:${ns}/head`,
      `+refs/heads/${pr.base.ref}:${ns}/base`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] }
  );
  const headSha = git(["rev-parse", `${ns}/head`]).trim();
  if (headSha !== pr.head.sha)
    die(`PR head moved while collecting (API ${pr.head.sha}, fetched ${headSha}); run again`);
  return {
    baseRef: `${ns}/base`,
    headRef: `${ns}/head`,
    subject: {
      source: "github-pr",
      repo,
      pr: pr.number,
      url: pr.html_url,
      title: pr.title,
      author: pr.user?.login ?? null,
      state: pr.state,
      draft: Boolean(pr.draft),
      base_ref: pr.base.ref,
      head_ref: pr.head.ref,
      // GitHub's own counters (renames detected), kept for cross-checking only.
      github_stats: { changed_files: pr.changed_files, additions: pr.additions, deletions: pr.deletions },
    },
  };
}

function changedFiles(mergeBase, headSha) {
  const range = [mergeBase, headSha];
  // --no-renames: a move counts as delete + add, so renames can't hide lines.
  const statusOut = git(["diff", "--no-renames", "--no-ext-diff", "-z", "--name-status", ...range]).split(
    "\0"
  );
  const statusByPath = new Map();
  for (let i = 0; i + 1 < statusOut.length; i += 2) statusByPath.set(statusOut[i + 1], statusOut[i]);

  const numstatOut = git(["diff", "--no-renames", "--no-ext-diff", "-z", "--numstat", ...range]).split("\0");
  const files = [];
  for (const entry of numstatOut) {
    if (!entry) continue;
    const [add, del, ...rest] = entry.split("\t");
    const path = rest.join("\t");
    const binary = add === "-" && del === "-";
    files.push({
      path,
      status: statusByPath.get(path) ?? "?",
      additions: binary ? null : Number(add),
      deletions: binary ? null : Number(del),
      binary,
    });
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      pr: { type: "string" },
      repo: { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
      policy: { type: "string", default: join(here, "policy.json") },
      out: { type: "string" },
      patch: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (args.help) {
    console.log(
      readFileSync(fileURLToPath(import.meta.url), "utf8")
        .split("\n")
        .slice(1, 22)
        .join("\n")
        .replace(/^\/\/ ?/gm, "")
    );
    return;
  }

  const policy = JSON.parse(readFileSync(args.policy, "utf8"));
  const policyErrors = validatePolicy(policy);
  if (policyErrors.length) die(`invalid policy: ${policyErrors.join("; ")}`);

  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());

  let baseRef, headRef, subject;
  if (args.pr) {
    if (args.base || args.head) die("--pr can't be combined with --base/--head");
    if (!/^\d+$/.test(args.pr)) die(`invalid PR number: ${args.pr}`);
    ({ baseRef, headRef, subject } = await resolvePr(args.repo ?? inferRepo(), Number(args.pr)));
  } else {
    baseRef = args.base ?? "main";
    headRef = args.head ?? "HEAD";
    subject = { source: "local", base_ref: baseRef, head_ref: headRef };
  }

  let baseSha, headSha, mergeBase;
  try {
    baseSha = git(["rev-parse", "--verify", `${baseRef}^{commit}`]).trim();
    headSha = git(["rev-parse", "--verify", `${headRef}^{commit}`]).trim();
    mergeBase = git(["merge-base", baseSha, headSha]).trim();
  } catch {
    die(`couldn't resolve ${baseRef}...${headRef}`);
  }

  const files = changedFiles(mergeBase, headSha).map((f) => {
    // Markers are read from the head version, or from the base for deletions.
    const rev = f.status === "D" ? mergeBase : headSha;
    const content = f.binary ? "" : git(["show", `${rev}:${f.path}`]);
    return { ...f, content_markers: findContentMarkers(content, policy) };
  });

  const evidence = {
    schema: "pr-autoapproval/evidence@1",
    policy_sha256: sha256(policy),
    subject: { ...subject, base_sha: baseSha, head_sha: headSha, merge_base_sha: mergeBase },
    diff: { command: `git diff --no-renames ${mergeBase} ${headSha}` },
    files,
  };

  const json = `${JSON.stringify(evidence, null, 2)}\n`;
  if (args.out) writeFileSync(args.out, json);
  else process.stdout.write(json);
  if (args.patch)
    writeFileSync(args.patch, git(["diff", "--no-renames", "--no-ext-diff", mergeBase, headSha]));
}

main().catch((e) => die(e.message));
