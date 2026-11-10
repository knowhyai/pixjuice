// Server-only: never import this module from src/ or a generated HTML page.
import process from "node:process";
import { WaffoPancake } from "@waffo/pancake-ts";

type EnvMap = {
  WAFFO_MERCHANT_ID?: string;
  WAFFO_PRIVATE_KEY?: string;
};

function read(env: EnvMap | undefined, key: keyof EnvMap) {
  return env?.[key] || process.env[key];
}

export function createClient(env?: EnvMap) {
  const merchantId = read(env, "WAFFO_MERCHANT_ID");
  const privateKey = read(env, "WAFFO_PRIVATE_KEY");
  if (!merchantId || !privateKey) {
    throw new Error("Payments are not configured");
  }
  return new WaffoPancake({
    merchantId,
    privateKey,
    environment: "prod",
  });
}

/** Product ID for a plan, validated to look like a Waffo product id. */
export function productFor(plan: string, env: { WAFFO_PRODUCT_LIFETIME?: string; WAFFO_PRODUCT_YEARLY?: string; WAFFO_PRODUCT_MONTHLY?: string }): string | undefined {
  const products: Record<string, string | undefined> = {
    lifetime: env.WAFFO_PRODUCT_LIFETIME,
    yearly: env.WAFFO_PRODUCT_YEARLY,
    monthly: env.WAFFO_PRODUCT_MONTHLY,
  };
  const id = products[plan];
  return id && /^PROD_[A-Za-z0-9]+$/.test(id) ? id : undefined;
}
