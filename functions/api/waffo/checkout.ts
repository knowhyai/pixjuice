// Checkout: the browser posts { plan }; the server picks the product and the
// price stays Waffo's. The license key is pre-generated here, so the metadata
// carries it into the webhook and the success URL returns it to the buyer.
import { createClient, productFor } from "../../lib/waffo";
import { generateKey } from "../../lib/licenses";
import type { Context } from "../../lib/platform";

const reply = (error: string, status: number) => Response.json({ error }, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function onRequest({ request, env }: Context): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply("Invalid origin", 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return reply("Expected JSON", 415);
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 1024) return reply("Request too large", 413);
    input = JSON.parse(body);
  } catch {
    return reply("Invalid JSON", 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return reply("Invalid checkout request", 400);
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== "plan") || typeof data.plan !== "string" || !["lifetime", "yearly", "monthly"].includes(data.plan)) {
    return reply("Choose lifetime, yearly, or monthly", 400);
  }
  const productId = productFor(data.plan, env);
  if (!productId) return reply("This plan is not available yet", 503);
  const site = (env.SITE_URL || "https://pixjuice.pages.dev").replace(/\/$/, "");
  const key = generateKey();
  try {
    const session = await createClient(env).checkout.createSession({
      productId,
      currency: "USD",
      successUrl: `${site}/pricing/?key=${key}`,
      metadata: { pixjuicePlan: data.plan, pixjuiceKey: key },
    });
    const url = new URL(session.checkoutUrl);
    if (url.protocol !== "https:") throw new Error("Invalid checkout URL");
    return Response.json({ checkoutUrl: url.href }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // SDK errors may contain request details. Never log or return them.
    return reply("Checkout is temporarily unavailable. Please try again later.", 502);
  }
}
