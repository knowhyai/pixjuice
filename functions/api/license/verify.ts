// License verification: POST { key } -> validity, plan and a signed token the
// browser caches (and refreshes through this same endpoint). Invalid keys are
// a 200 with valid:false — it's an application answer, not a transport error.
import { signToken } from "../../lib/tokens";
import { normalizeKey } from "../../lib/licenses";
import type { Context, D1Database } from "../../lib/platform";

interface LicenseRow {
  key: string;
  plan: "lifetime" | "yearly" | "monthly";
  status: string;
  expires_at: string | null;
}

function findLicense(db: D1Database, normalized: string): Promise<LicenseRow | null> {
  return db
    .prepare("SELECT key, plan, status, expires_at FROM valid_licenses WHERE replace(upper(key), '-', '') = ?")
    .bind(normalized)
    .first<LicenseRow>();
}

// Tokens carry the license's own expiry (0 = lifetime); the browser refreshes
// them against this endpoint daily, which is how revocations reach it.
export async function onRequest({ request, env }: Context): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ valid: false, error: "Invalid origin" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  let key: unknown;
  try {
    const body = await request.text();
    if (body.length > 256) throw new Error("too large");
    key = (JSON.parse(body) as { key?: unknown }).key;
  } catch {
    return Response.json({ valid: false }, { headers: { "Cache-Control": "no-store" } });
  }
  if (typeof key !== "string" || key.length > 64) {
    return Response.json({ valid: false }, { headers: { "Cache-Control": "no-store" } });
  }
  const normalized = normalizeKey(key);
  if (!env.LICENSES_DB || !env.LICENSE_SIGNING_KEY || normalized.length < 8) {
    return Response.json({ valid: false }, { headers: { "Cache-Control": "no-store" } });
  }
  let row: LicenseRow | null = null;
  try {
    row = await findLicense(env.LICENSES_DB, normalized);
  } catch {
    return Response.json({ valid: false, error: "License storage unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!row) return Response.json({ valid: false }, { headers: { "Cache-Control": "no-store" } });
  const expMs = row.expires_at ? Date.parse(`${row.expires_at.replace(" ", "T")}Z`) : 0;
  const now = Date.now();
  if (expMs && expMs <= now) {
    return Response.json({ valid: false }, { headers: { "Cache-Control": "no-store" } });
  }
  let token: string;
  try {
    token = await signToken({ k: row.key, p: row.plan, e: expMs, i: now }, env.LICENSE_SIGNING_KEY);
  } catch {
    return Response.json({ valid: false, error: "License signing unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    { valid: true, plan: row.plan, expiresAt: row.expires_at, token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
