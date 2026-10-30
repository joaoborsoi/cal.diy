// Thin GitHub I/O for the delivery harness, through the `gh` CLI (available on
// GitHub-hosted runners; authenticates with GH_TOKEN).

import { execFileSync } from "node:child_process";

import { LABEL_PREFIX, PANEL_MARKER, STATES, TRIGGER_LABEL, parsePanel, renderPanel } from "./lib.mjs";

const REPO = process.env.GITHUB_REPOSITORY;

function gh(args, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function api(method, path, body) {
  const args = ["api", "-X", method, `repos/${REPO}/${path}`];
  if (body) args.push("--input", "-");
  const out = gh(args, body ? JSON.stringify(body) : undefined);
  return out.trim() ? JSON.parse(out) : null;
}

export function listComments(issue) {
  const out = gh(["api", "--paginate", "--slurp", `repos/${REPO}/issues/${issue}/comments?per_page=100`]);
  return JSON.parse(out).flat();
}

// The panel is the first comment carrying the state marker. Only comments by
// the bot that runs the workflow count, so nobody can forge a state by pasting
// the marker in a comment of their own.
export function loadPanel(issue) {
  const panel = listComments(issue).find(
    (c) => c.user?.login === "github-actions[bot]" && c.body?.startsWith(PANEL_MARKER)
  );
  return panel ? { id: panel.id, state: parsePanel(panel.body) } : { id: null, state: null };
}

export function savePanel(issue, panelId, state) {
  const body = renderPanel(state);
  if (panelId) return api("PATCH", `issues/comments/${panelId}`, { body }).id;
  return api("POST", `issues/${issue}/comments`, { body }).id;
}

// REST can't take a PR out of draft; `gh pr ready` goes through GraphQL. A PR
// that is already ready (e.g. after a failed auto-approval) is not an error.
export function markReady(pr) {
  try {
    gh(["pr", "ready", String(pr), "--repo", REPO]);
  } catch (err) {
    if (api("GET", `pulls/${pr}`).draft) throw err;
  }
}

export const comment = (issue, body) => api("POST", `issues/${issue}/comments`, { body });

const LABEL_COLORS = { auto: "1d76db", human: "fbca04", final: "0e8a16" };

export function ensureLabels() {
  const wanted = [
    { name: TRIGGER_LABEL, color: "d93f0b", description: "Inicia o harness de entrega do Claude" },
    ...Object.entries(STATES).map(([name, s]) => ({
      name: `${LABEL_PREFIX}${name}`,
      color: LABEL_COLORS[s.kind],
      description: s.description,
    })),
  ];
  const existing = new Set(
    JSON.parse(gh(["label", "list", "--repo", REPO, "--limit", "200", "--json", "name"])).map((l) => l.name)
  );
  for (const label of wanted.filter((l) => !existing.has(l.name))) {
    gh([
      "label",
      "create",
      label.name,
      "--repo",
      REPO,
      "--color",
      label.color,
      "--description",
      label.description,
    ]);
  }
}

// Swap the `harness:*` label to mirror the current state.
export function syncStateLabel(issue, state) {
  const current = api("GET", `issues/${issue}`).labels.map((l) => l.name);
  for (const name of current.filter((n) => n.startsWith(LABEL_PREFIX) && n !== `${LABEL_PREFIX}${state}`)) {
    gh(["issue", "edit", String(issue), "--repo", REPO, "--remove-label", name]);
  }
  if (!current.includes(`${LABEL_PREFIX}${state}`)) {
    gh(["issue", "edit", String(issue), "--repo", REPO, "--add-label", `${LABEL_PREFIX}${state}`]);
  }
}

// Runs started with GITHUB_TOKEN don't trigger `issues`/`issue_comment`
// workflows, but `workflow_dispatch` is allowed — that's how one stage hands
// over to the next.
export function dispatchNext(issue) {
  const ref = process.env.GITHUB_REF_NAME;
  gh([
    "workflow",
    "run",
    process.env.HARNESS_WORKFLOW ?? "delivery-harness.yml",
    "--repo",
    REPO,
    "--ref",
    ref,
    "-f",
    `issue=${issue}`,
  ]);
}

export const runUrl = () =>
  process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined;
