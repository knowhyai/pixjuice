// License tokens: ECDSA P-256 over the JSON claims, so the browser can verify
// them with the public half served by /api/license/pubkey. The private JWK
// lives only in wrangler secrets / .dev.vars.

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_ALG = { name: "ECDSA", hash: "SHA-256" } as const;

export interface TokenClaims {
  /** The full license key ("PJV-XXXX-…"), so re-verification matches the row. */
  k: string;
  p: "lifetime" | "yearly" | "monthly";
  /** Expiry of the license in epoch ms; 0 = lifetime. */
  e: number;
  /** Token issue time (epoch ms) — the client refreshes when older than a day. */
  i: number;
}

let signKey: CryptoKey | null = null;
let signKeyJwk: JsonWebKey | null = null;

/** Import (and per-isolate cache) the signing key. Throws when unconfigured. */
async function key(jwkText: string): Promise<CryptoKey> {
  if (signKey) return signKey;
  const jwk = JSON.parse(jwkText) as JsonWebKey;
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.d !== "string") {
    throw new Error("LICENSE_SIGNING_KEY must be an EC P-256 private JWK");
  }
  signKey = await crypto.subtle.importKey("jwk", jwk, ALG, true, ["sign"]);
  signKeyJwk = jwk;
  return signKey;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sign claims into "b64url(claims).b64url(signature)". */
export async function signToken(claims: TokenClaims, jwkText: string): Promise<string> {
  const k = await key(jwkText);
  const payload = new TextEncoder().encode(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(SIGN_ALG, k, payload as unknown as ArrayBuffer);
  return `${b64url(payload)}.${b64url(new Uint8Array(sig))}`;
}

/** The public JWK (private field stripped) for browser-side verification. */
export async function publicJwk(jwkText: string): Promise<JsonWebKey> {
  await key(jwkText); // populates signKeyJwk alongside
  const { d, ...pub } = signKeyJwk!;
  void d;
  return pub;
}
