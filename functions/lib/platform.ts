// Minimal structural types for Pages Functions: the D1 surface we use, the
// Waffo env vars, and the shared request context. Kept hand-written (like the
// noaitell payments integration) so the functions tree type-checks standalone.

export interface D1Result {
  meta: { changes: number };
}
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1Statement;
}

export interface Env {
  LICENSES_DB?: D1Database;
  WAFFO_MERCHANT_ID?: string;
  WAFFO_PRIVATE_KEY?: string;
  WAFFO_STORE_ID?: string;
  WAFFO_PRODUCT_LIFETIME?: string;
  WAFFO_PRODUCT_YEARLY?: string;
  WAFFO_PRODUCT_MONTHLY?: string;
  LICENSE_SIGNING_KEY?: string;
  SITE_URL?: string;
}

export interface Context {
  request: Request;
  env: Env;
}

/** The three VIP plans, as used in metadata, the D1 row and the license token. */
export type Plan = "lifetime" | "yearly" | "monthly";
