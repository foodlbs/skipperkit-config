// index.ts — POST /submit-config: validate → rate-limit → dedupe → publish PR.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validate } from "./validate.ts";
import { fetchLiveConfig, isPublished, publish, type PendingRow } from "./github.ts";

const MAX_BODY = 16 * 1024;
const DAILY_LIMIT = 10;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const result = validate(parsed);
  if (!result.ok) return new Response(null, { status: 400 });
  const sub = result.value;

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // cf-connecting-ip is proxy-injected (not client-spoofable); fall back to the
  // LAST x-forwarded-for hop, which the trusted edge appended.
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = (req.headers.get("cf-connecting-ip") ??
    (xff.includes(",") ? xff.split(",").at(-1)!.trim() : xff.trim())) || "unknown";

  // Atomic increment-and-check (Postgres function); also purges stale-day rows.
  // Fail CLOSED: anything but a bare integer (error, unexpected shape) is a 429.
  const { data: hits, error: rlError } = await db.rpc("bump_rate_limit", { p_ip: ip });
  if (rlError || typeof hits !== "number" || hits > DAILY_LIMIT) {
    return new Response(null, { status: 429 });
  }

  // Upsert each button; entries already live in config.json are recorded as merged.
  const config = await fetchLiveConfig();
  for (const b of sub.buttons) {
    const published = isPublished(config, sub.packageName, b);
    // Query mirrors the table's unique key (package, target, view_id, label) with nulls-not-distinct semantics.
    // `let query: any` is needed because the supabase-js builder returns a new type on each chained call.
    let query: any = db.from("submissions").select()
      .eq("package", sub.packageName).eq("target", b.target);
    query = b.viewId === null ? query.is("view_id", null) : query.eq("view_id", b.viewId);
    query = b.label === null ? query.is("label", null) : query.eq("label", b.label);
    const { data: existing } = await query.maybeSingle();
    if (existing) {
      await db.from("submissions").update({
        report_count: existing.report_count + 1,
        last_seen: new Date().toISOString(),
        app_versions: [...new Set([...existing.app_versions, sub.appVersionName].filter(Boolean))].slice(0, 50),
        locales: [...new Set([...existing.locales, sub.locale].filter(Boolean))].slice(0, 50),
      }).eq("id", existing.id);
    } else {
      await db.from("submissions").insert({
        package: sub.packageName, target: b.target,
        view_id: b.viewId, label: b.label,
        app_versions: [sub.appVersionName].filter(Boolean),
        locales: [sub.locale].filter(Boolean),
        status: published ? "merged" : "pending",
      });
    }
  }

  // Custom buttons follow the same upsert, stored as target CUSTOM with a
  // display name (first reporter's name wins; later reports only bump counts).
  for (const c of sub.customButtons) {
    const published = isPublished(config, sub.packageName, { target: "CUSTOM", viewId: c.viewId, label: c.label });
    let query: any = db.from("submissions").select()
      .eq("package", sub.packageName).eq("target", "CUSTOM");
    query = c.viewId === null ? query.is("view_id", null) : query.eq("view_id", c.viewId);
    query = c.label === null ? query.is("label", null) : query.eq("label", c.label);
    const { data: existing } = await query.maybeSingle();
    if (existing) {
      await db.from("submissions").update({
        report_count: existing.report_count + 1,
        name: existing.name ?? c.name,
        last_seen: new Date().toISOString(),
        app_versions: [...new Set([...existing.app_versions, sub.appVersionName].filter(Boolean))].slice(0, 50),
        locales: [...new Set([...existing.locales, sub.locale].filter(Boolean))].slice(0, 50),
      }).eq("id", existing.id);
    } else {
      await db.from("submissions").insert({
        package: sub.packageName, target: "CUSTOM",
        view_id: c.viewId, label: c.label, name: c.name,
        app_versions: [sub.appVersionName].filter(Boolean),
        locales: [sub.locale].filter(Boolean),
        status: published ? "merged" : "pending",
      });
    }
  }

  // Publish every pending + pr_open row for this package as one PR. Gate on a
  // pending row existing: new entries AND previously failed publishes trigger
  // GitHub calls; pure duplicates of already-PR'd entries don't.
  const { data: rows } = await db.from("submissions").select()
    .eq("package", sub.packageName).in("status", ["pending", "pr_open"]);
  const hasPending = rows?.some((r: { status: string }) => r.status === "pending") ?? false;
  if (hasPending && rows && rows.length > 0) {
    try {
      await publish(Deno.env.get("GITHUB_PAT")!, sub.packageName, rows as PendingRow[]);
      await db.from("submissions").update({ status: "pr_open" })
        .eq("package", sub.packageName).eq("status", "pending");
    } catch (e) {
      console.error("publish failed; rows stay pending", e);
    }
  }

  return new Response(JSON.stringify({ accepted: sub.buttons.length + sub.customButtons.length }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
