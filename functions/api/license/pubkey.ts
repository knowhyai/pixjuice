// The token-signing public key: derived from the private secret at runtime, so
// rotating the secret needs no redeploy of anything public. Cacheable — it only
// changes together with the secret.
import { publicJwk } from "../../lib/tokens";
import type { Context } from "../../lib/platform";

export async function onRequest({ env }: Context): Promise<Response> {
  if (!env.LICENSE_SIGNING_KEY) {
    return Response.json({ error: "License signing unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const jwk = await publicJwk(env.LICENSE_SIGNING_KEY);
    return Response.json(jwk, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "License signing unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
