// Lost-key lookup: POST { email } -> the buyer's active license keys. This is
// the only retrieval path for orders whose checkout happened without our
// pre-generated key (e.g. dashboard-created test orders).
import type { Context } from "../../lib/platform";

interface KeyRow {
  key: string;
  plan: string;
  expires_at: string | null;
}

export async function onRequest({ request, env }: Context): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ keys: [] }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  let email: unknown;
  try {
    const body = await request.text();
    if (body.length > 256) throw new Error("too large");
    email = (JSON.parse(body) as { email?: unknown }).email;
  } catch {
    return Response.json({ keys: [] }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (typeof email !== "string" || !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{1,20}$/.test(email)) {
    return Response.json({ keys: [] }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!env.LICENSES_DB) {
    return Response.json({ keys: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  let rows: KeyRow[] = [];
  try {
    const res = await env.LICENSES_DB
      .prepare("SELECT key, plan, expires_at FROM valid_licenses WHERE email = ? ORDER BY created_at DESC")
      .bind(email.toLowerCase())
      .all<KeyRow>();
    rows = res.results;
  } catch {
    return Response.json({ keys: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ keys: rows }, { headers: { "Cache-Control": "no-store" } });
}
