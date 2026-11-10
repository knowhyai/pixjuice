// Waffo webhook: verify the RSA-SHA256 signature over the raw body, dedupe the
// delivery, then project the event into the licenses table. Storage failures
// return 5xx so Waffo retries; nothing about the payload is ever logged.
import { verifyWebhook } from "@waffo/pancake-ts";
import { applyEvent, recordEvent } from "../../lib/licenses";
import type { Context } from "../../lib/platform";

export async function onRequest({ request, env }: Context): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const body = await request.text(); // Exact signed bytes; never request.json().
  let event;
  try {
    event = verifyWebhook(body, request.headers.get("x-waffo-signature"));
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }
  // Accept test and prod deliveries (the products decide what is real), but
  // only for our store.
  if (!env.WAFFO_STORE_ID || event.storeId !== env.WAFFO_STORE_ID) {
    return new Response("Unexpected store", { status: 403 });
  }
  if (!env.LICENSES_DB) return new Response("License storage unavailable", { status: 503 });
  const orderId = (event.data as { orderId?: string })?.orderId;
  try {
    const fresh = await recordEvent(env.LICENSES_DB, event.id, event.eventType, orderId);
    if (fresh) await applyEvent(env.LICENSES_DB, event.eventType, event.data as unknown as Parameters<typeof applyEvent>[2]);
  } catch {
    // No ACK on storage failure: Waffo must retry. No payload/error logging.
    return new Response("License storage unavailable", { status: 503 });
  }
  return new Response("OK", { headers: { "Cache-Control": "no-store" } });
}
