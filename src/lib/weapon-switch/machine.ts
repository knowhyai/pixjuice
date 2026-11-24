import { clampParams, DEFAULTS } from "./params";
import type { LogEntry, Outcome, Params, Phase, Reason, Slot } from "./types";

interface Pending {
  slot: Slot;
  expires: number;
}

export class WeaponSwitchMachine {
  private clock = 0;
  private current: Phase = { kind: "idle", start: 0 };
  private weapon: Slot = 1;
  private queued: Pending | null = null;
  private readyAt = { 1: 0, 2: 0, 3: 0 };
  private cooldownLength = { 1: 0, 2: 0, 3: 0 };
  private entries: LogEntry[] = [];
  private completed: { phase: Phase; end: number }[] = [];
  private params: Params;
  private drawDuration = 0;

  constructor(params: Readonly<Params> = DEFAULTS) {
    this.params = clampParams(params);
  }

  get now() { return this.clock; }
  get phase(): Readonly<Phase> { return this.current; }
  get equipped() { return this.weapon; }
  get pending(): Readonly<Pending> | null { return this.queued; }
  get log(): readonly Readonly<LogEntry>[] { return this.entries; }
  get history(): readonly { readonly phase: Readonly<Phase>; readonly end: number }[] { return this.completed; }

  configure(params: Readonly<Params>) {
    this.params = clampParams(params);
  }

  cooldown(slot: Slot) {
    return { remaining: Math.max(0, this.readyAt[slot] - this.clock), duration: this.cooldownLength[slot] };
  }

  resetDemo() {
    this.clock = 0;
    this.current = { kind: "idle", start: 0 };
    this.weapon = 1;
    this.queued = null;
    this.readyAt = { 1: 0, 2: 0, 3: 0 };
    this.cooldownLength = { 1: 0, 2: 0, 3: 0 };
    this.entries = [];
    this.completed = [];
    this.drawDuration = 0;
  }

  private record(outcome: Outcome, slot: Slot, reason: Reason) {
    this.entries.push({ time: this.clock, slot, outcome, reason });
    if (this.entries.length > 80) this.entries.shift();
  }

  private enter(phase: Phase) {
    this.completed.push({ phase: this.current, end: this.clock });
    if (this.completed.length > 32) this.completed.shift();
    this.current = phase;
  }

  private startSwitch(slot: Slot, reason: Reason) {
    this.queued = null;
    this.drawDuration = this.params.drawMs;
    this.enter({ kind: "holster", start: this.clock, end: this.clock + this.params.holsterMs, target: slot });
    this.record("executed", slot, reason);
  }

  inputFire() {
    const slot = this.weapon;
    this.record("received", slot, "fire");
    if (this.current.kind !== "idle" || this.readyAt[slot] > this.clock) {
      this.record("discarded", slot, this.current.kind === "idle" ? "cooling" : "notIdle");
      return false;
    }
    const p = this.params;
    this.readyAt[slot] = this.clock + p.cooldownMs;
    this.cooldownLength[slot] = p.cooldownMs;
    this.enter({
      kind: "busy", start: this.clock, end: this.clock + p.busyMs, visual: p.busyKind,
      opens: this.clock + p.cancelWindowStartMs, closes: this.clock + p.cancelWindowEndMs,
    });
    this.record("executed", slot, "busyStarted");
    this.advance(0);
    return true;
  }

  inputSwitch(slot: Slot) {
    this.record("received", slot, "switch");
    const phase = this.current;
    if (phase.kind === "holster" || phase.kind === "draw") {
      this.record("discarded", slot, "switching");
      return;
    }
    if (this.queued) {
      this.record("overwritten", this.queued.slot, "replaced");
      this.queued = null;
    }
    if (slot === this.weapon) this.record("discarded", slot, "sameSlot");
    else if (phase.kind === "idle") this.startSwitch(slot, "fromIdle");
    else if (phase.kind === "busy") {
      if (this.params.busyPolicy === "interrupt") this.startSwitch(slot, "interrupted");
      else if (this.clock >= phase.opens && this.clock <= phase.closes) this.startSwitch(slot, "inWindow");
      else if (this.clock > phase.closes) this.record("discarded", slot, "afterWindow");
      else if (this.params.bufferTtlMs === 0) this.record("discarded", slot, "noBuffer");
      else {
        this.queued = { slot, expires: this.clock + this.params.bufferTtlMs };
        this.record("buffered", slot, "wait");
      }
    }
    this.advance(0);
  }

  advance(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    const until = this.clock + ms;
    while (this.current.kind !== "idle") {
      const phase = this.current;
      const pending = this.queued;
      if (phase.kind === "busy" && pending) {
        // A request is valid at its deadline. An opening at the deadline wins the tie.
        if (phase.opens <= pending.expires && phase.opens <= until) {
          this.clock = phase.opens;
          this.startSwitch(pending.slot, "atWindow");
          continue;
        }
        if (pending.expires < phase.opens && pending.expires <= until) {
          this.clock = pending.expires;
          this.queued = null;
          this.record("expired", pending.slot, "ttl");
          continue;
        }
      }
      if (phase.end > until) break;
      this.clock = phase.end;
      if (phase.kind === "holster") {
        this.enter({ kind: "draw", start: this.clock, end: this.clock + this.drawDuration, target: phase.target });
      } else {
        if (phase.kind === "draw") this.weapon = phase.target;
        this.enter({ kind: "idle", start: this.clock });
      }
    }
    this.clock = until;
  }
}

// Fire and Switch require a user gesture through a button or keyboard shortcut.
export function shouldAutoplay(): false {
  return false;
}
