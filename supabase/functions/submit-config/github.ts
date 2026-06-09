// github.ts — opens/updates one PR per package on foodlbs/skipperkit-config.
import type { CleanButton } from "./validate.ts";

// Strip bidi/control chars and escape markdown so attacker-controlled strings
// can't break the PR table, smuggle links, or ping users.
function mdEscape(s: string): string {
  return s
    .replace(/[‪-‮⁦-⁩‎‏ -]/g, "")
    .replace(/[|`\\\[\]()@]/g, (c) => `\\${c}`);
}

const OWNER = "foodlbs";
const REPO = "skipperkit-config";
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW_CONFIG = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/config.json`;

export interface PendingRow {
  package: string;
  target: string;
  view_id: string | null;
  label: string | null;
  report_count: number;
  app_versions: string[];
  locales: string[];
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

export async function fetchLiveConfig(): Promise<any> {
  const res = await fetch(RAW_CONFIG);
  if (!res.ok) throw new Error(`config fetch ${res.status}`);
  return await res.json();
}

/** True if the button is already in the app's published arrays. */
export function isPublished(config: any, pkg: string, b: CleanButton): boolean {
  const app = (config.apps ?? []).find((a: any) => a.packageName === pkg);
  if (!app) return false;
  const ids = b.target === "SKIP_INTRO" ? app.skipIntroViewIds : app.skipRecapViewIds;
  const labels = b.target === "SKIP_INTRO" ? app.skipIntroLabels : app.skipRecapLabels;
  if (b.viewId) return (ids ?? []).includes(b.viewId);
  return (labels ?? []).some((l: string) => l.toLowerCase() === b.label!.toLowerCase());
}

function mergeIntoConfig(config: any, pkg: string, rows: PendingRow[]): any {
  const next = structuredClone(config);
  let app = next.apps.find((a: any) => a.packageName === pkg);
  if (!app) {
    app = {
      packageName: pkg, locale: "en",
      skipIntroViewIds: [], skipIntroLabels: [],
      skipRecapViewIds: [], skipRecapLabels: [],
      nextEpisodeViewIds: [], nextEpisodeLabels: [],
      enabled: true, autoNextEnabled: false,
    };
    next.apps.push(app);
  }
  const has = (arr: string[], v: string) => arr.some((x) => x.toLowerCase() === v.toLowerCase());
  for (const r of rows) {
    const ids = r.target === "SKIP_INTRO" ? app.skipIntroViewIds : app.skipRecapViewIds;
    const labels = r.target === "SKIP_INTRO" ? app.skipIntroLabels : app.skipRecapLabels;
    if (r.view_id && !ids.includes(r.view_id)) ids.push(r.view_id);
    if (!r.view_id && r.label && !has(labels, r.label)) labels.push(r.label);
  }
  return next;
}

function prBody(pkg: string, rows: PendingRow[]): string {
  const lines = rows.map((r) =>
    `| ${r.target} | ${mdEscape(r.view_id ?? "—")} | ${mdEscape(r.label ?? "—")} | ${r.report_count} | ${
      mdEscape(r.app_versions.join(", ") || "—")} | ${mdEscape(r.locales.join(", ") || "—")} |`
  );
  return [
    `Community-submitted skip buttons for \`${pkg}\` (via the in-app one-tap flow).`,
    "",
    "| Target | View id | Label | Reports | App versions | Locales |",
    "|---|---|---|---|---|---|",
    ...lines,
    "",
    "_Opened automatically by the SkipperKit submission function. Review before merging._",
  ].join("\n");
}

/** Push branch `submissions/<pkg>` with merged config.json and open/update its PR. */
export async function publish(token: string, pkg: string, rows: PendingRow[]): Promise<void> {
  const h = headers(token);
  const branch = `submissions/${pkg}`;

  const mainRef = await (await fetch(`${API}/git/ref/heads/main`, { headers: h })).json();
  if (!mainRef?.object?.sha) throw new Error("ref lookup failed");
  const mainSha = mainRef.object.sha;

  // Create the branch off main if it doesn't exist; never reset an existing
  // branch — maintainers may have pushed review edits to it.
  const create = await fetch(`${API}/git/refs`, {
    method: "POST", headers: h,
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha }),
  });
  if (!create.ok && create.status !== 422) throw new Error(`branch ${create.status}`);

  const fileMeta = await (await fetch(`${API}/contents/config.json?ref=${branch}`, { headers: h })).json();
  if (!fileMeta?.content || !fileMeta?.sha) throw new Error("contents lookup failed");
  const config = JSON.parse(atob(fileMeta.content.replaceAll("\n", "")));
  const merged = mergeIntoConfig(config, pkg, rows);
  const put = await fetch(`${API}/contents/config.json`, {
    method: "PUT", headers: h,
    body: JSON.stringify({
      message: `Add community-submitted buttons for ${pkg}`,
      content: btoa(JSON.stringify(merged, null, 2) + "\n"),
      sha: fileMeta.sha,
      branch,
    }),
  });
  if (!put.ok) throw new Error(`contents PUT ${put.status}`);

  const open = await (await fetch(
    `${API}/pulls?state=open&head=${OWNER}:${branch}`, { headers: h },
  )).json();
  if (open.length === 0) {
    const pr = await fetch(`${API}/pulls`, {
      method: "POST", headers: h,
      body: JSON.stringify({
        title: `Community submission: ${pkg}`,
        head: branch, base: "main", body: prBody(pkg, rows),
      }),
    });
    if (!pr.ok) throw new Error(`PR create ${pr.status}`);
  } else {
    await fetch(`${API}/pulls/${open[0].number}`, {
      method: "PATCH", headers: h, body: JSON.stringify({ body: prBody(pkg, rows) }),
    });
  }
}
