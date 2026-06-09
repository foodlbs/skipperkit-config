// validate.ts — pure validation, mirrors the app's TaughtAppPort constraints.
const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const MAX_BUTTONS = 20;
const MAX_STRING = 256;
const MAX_META = 64;
const TARGETS = new Set(["SKIP_INTRO", "SKIP_RECAP"]);

export interface CleanButton {
  target: "SKIP_INTRO" | "SKIP_RECAP";
  viewId: string | null;
  label: string | null;
}
export interface CleanSubmission {
  packageName: string;
  displayName: string;
  buttons: CleanButton[];
  appVersionName: string | null;
  skipperkitVersion: string | null;
  locale: string | null;
}
export type Result = { ok: true; value: CleanSubmission } | { ok: false; reason: string };

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : null;
}

export function validate(body: unknown): Result {
  if (typeof body !== "object" || body === null) return { ok: false, reason: "not an object" };
  const o = body as Record<string, unknown>;
  if (o.skipperkitContribution !== 1) return { ok: false, reason: "bad format marker" };

  const packageName = str(o.packageName, MAX_STRING);
  if (!packageName || !PACKAGE_RE.test(packageName)) return { ok: false, reason: "bad package" };

  const raw = Array.isArray(o.buttons) ? o.buttons.slice(0, MAX_BUTTONS) : [];
  const buttons: CleanButton[] = [];
  for (const b of raw) {
    if (typeof b !== "object" || b === null) continue;
    const bo = b as Record<string, unknown>;
    if (typeof bo.target !== "string" || !TARGETS.has(bo.target)) continue;
    const viewId = str(bo.viewId, MAX_STRING);
    const label = str(bo.label, MAX_STRING);
    if (!viewId && !label) continue;
    buttons.push({ target: bo.target as CleanButton["target"], viewId, label });
  }
  if (buttons.length === 0) return { ok: false, reason: "no usable buttons" };

  return {
    ok: true,
    value: {
      packageName,
      displayName: str(o.displayName, 50) ?? packageName,
      buttons,
      appVersionName: str(o.appVersionName, MAX_META),
      skipperkitVersion: str(o.skipperkitVersion, MAX_META),
      locale: str(o.locale, MAX_META),
    },
  };
}
