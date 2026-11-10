// License keys: generation, plan mapping from a Waffo event, and the D1 writes
// that turn verified webhook events into/updating license rows. One row per
// Waffo order; the key stays stable across renewals and redeliveries.

import type { D1Database, Plan } from "./platform";

/** Alphabet without 0/O and 1/I — every key stays retypable. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const GROUPS = 4;
const GROUP_LEN = 4;

export function generateKey(): string {
  const bytes = new Uint8Array(GROUPS * GROUP_LEN);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  const groups = Array.from({ length: GROUPS }, (_, g) =>
    chars.slice(g * GROUP_LEN, (g + 1) * GROUP_LEN).join(""),
  );
  return `PJV-${groups.join("-")}`;
}

/** Canonical form for comparisons: uppercase alphanumerics only ("pjv" included). */
export function normalizeKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A metadata-supplied key must be a full, well-formed key before we trust it. */
export function isValidKeyFormat(key: string): boolean {
  const body = key.replace(/^PJV-?/i, "").replace(/-/g, "");
  return body.length === GROUPS * GROUP_LEN && [...body].every((c) => ALPHABET.includes(c));
}

/** "YYYY-MM-DD HH:MM:SS" in UTC — the same shape as SQLite datetime('now'),
 *  so the valid_licenses view's string comparison stays correct. */
export function sqlUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

/** Waffo dates are ISO 8601 ("2026-05-01" or fuller); normalize to the SQL shape. */
function toSqlUtc(value: string | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value.length === 10 ? `${value}T23:59:59Z` : value);
  return Number.isNaN(t) ? null : sqlUtc(t);
}

const PLAN_NAMES: [Plan, RegExp][] = [
  ["lifetime", /life(?:time|long)|forever|buyout/i],
  ["yearly", /year|annual/i],
  ["monthly", /month/i],
];

/** Which plan an event belongs to: checkout metadata first (we set it), then
 *  product metadata, then the dashboard product's name. */
export function planFromEvent(data: {
  orderMetadata?: Record<string, string>;
  productMetadata?: Record<string, string>;
  productName?: string;
}): Plan | null {
  const raw = data.orderMetadata?.pixjuicePlan ?? data.productMetadata?.pixjuicePlan;
  if (raw === "lifetime" || raw === "yearly" || raw === "monthly") return raw;
  const name = data.productName ?? "";
  for (const [plan, re] of PLAN_NAMES) if (re.test(name)) return plan;
  return null;
}

interface EventData {
  orderId: string;
  buyerEmail: string;
  orderMetadata?: Record<string, string>;
  productMetadata?: Record<string, string>;
  productName?: string;
  currentPeriodEnd?: string;
}

/** Renewal fallback when the event carries no period end: generous rather than short. */
function fallbackExpiry(plan: Plan): string {
  const days = plan === "yearly" ? 370 : 32;
  return sqlUtc(Date.now() + days * 86_400_000);
}

/** Record a delivery, deduplicating redeliveries. Returns false when already seen. */
export async function recordEvent(
  db: D1Database,
  id: string,
  eventType: string,
  orderId: string | undefined,
): Promise<boolean> {
  const res = await db
    .prepare("INSERT INTO webhook_events (id, event_type, order_id) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING")
    .bind(id, eventType, orderId ?? null)
    .run();
  return res.meta.changes > 0;
}

/** Apply a (already deduplicated) event to the licenses table. */
export async function applyEvent(db: D1Database, eventType: string, data: EventData): Promise<void> {
  const plan = planFromEvent(data);
  const email = data.buyerEmail.toLowerCase();

  if (eventType === "order.completed" && plan) {
    // The checkout session pre-generated the key and carried it in metadata so
    // the success redirect can show it; fall back to a fresh key otherwise.
    const supplied = data.orderMetadata?.pixjuiceKey;
    const key = supplied && isValidKeyFormat(supplied) ? supplied : generateKey();
    await db
      .prepare(
        `INSERT INTO licenses (key, email, plan, status, order_id, expires_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT(order_id) DO UPDATE SET
           email = excluded.email, plan = excluded.plan, status = 'active',
           expires_at = NULL, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(key, email, plan, data.orderId)
      .run();
    return;
  }

  if (eventType === "subscription.activated" || eventType === "subscription.renewed" || eventType === "subscription.recovered") {
    if (!plan) return;
    const expires = toSqlUtc(data.currentPeriodEnd) ?? fallbackExpiry(plan);
    const key = generateKey();
    await db
      .prepare(
        `INSERT INTO licenses (key, email, plan, status, order_id, expires_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(order_id) DO UPDATE SET
           email = excluded.email, plan = excluded.plan, status = 'active',
           expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(key, email, plan, data.orderId, expires)
      .run();
    return;
  }

  if (eventType === "subscription.canceled" || eventType === "subscription.past_due") {
    await db
      .prepare("UPDATE licenses SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?")
      .bind(data.orderId)
      .run();
    return;
  }

  if (eventType === "subscription.uncanceled") {
    await db
      .prepare("UPDATE licenses SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?")
      .bind(data.orderId)
      .run();
    return;
  }

  if (eventType === "refund.succeeded") {
    // A refund (full or partial) revokes the license for that order, terminal.
    await db
      .prepare("UPDATE licenses SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?")
      .bind(data.orderId)
      .run();
  }
  // Everything else is recorded in webhook_events only.
}
