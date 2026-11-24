export type Slot = 1 | 2 | 3;
export const SLOTS = [1, 2, 3] as const;
export type Mode = "default" | "mine";

export interface Params {
  holsterMs: number;
  drawMs: number;
  busyMs: number;
  busyKind: "fire" | "reload";
  busyPolicy: "interrupt" | "buffer";
  bufferTtlMs: number;
  cancelWindowStartMs: number;
  cancelWindowEndMs: number;
  cooldownMs: number;
}

export type Phase = { kind: "idle"; start: number } |
  { kind: "busy"; start: number; end: number; visual: Params["busyKind"]; opens: number; closes: number } |
  { kind: "holster" | "draw"; start: number; end: number; target: Slot };

export type Outcome = "received" | "buffered" | "overwritten" | "expired" | "discarded" | "executed";
export type Reason = "fire" | "switch" | "wait" | "replaced" | "ttl" | "afterWindow" |
  "noBuffer" | "sameSlot" | "switching" | "notIdle" | "cooling" | "busyStarted" |
  "fromIdle" | "interrupted" | "inWindow" | "atWindow";

export interface LogEntry {
  time: number;
  slot: Slot;
  outcome: Outcome;
  reason: Reason;
}
