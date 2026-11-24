import type { Command, LogEntry, LogEvent, Phase, ReloadParams } from "./types";

export function shouldAutoplay(): false {
  return false;
}

export function createReloadMachine(params: Readonly<ReloadParams>) {
  const recipe = { ...params };
  const { magOutMs, commitMs, finishMs, magCapacity, keepChamberRound } = recipe;
  let phase: Phase;
  let timeMs: number;
  let mag: number;
  let reserve: number;
  let chamber: number;
  let hasMagazine: boolean;
  let startedWithMag: number;
  let chamberAtStart: number;
  let committed: boolean;
  let log: LogEntry[];

  function resetDemo() {
    phase = "idle";
    timeMs = 0;
    mag = recipe.startMag;
    reserve = recipe.startReserve;
    chamber = 0;
    hasMagazine = true;
    startedWithMag = 0;
    chamberAtStart = 0;
    committed = false;
    log = [];
  }

  function record(event: LogEvent) {
    log.push({ event, timeMs, mag, reserve, chamber });
    if (log.length > 60) log.shift();
  }

  function advance(ms: number) {
    if (phase === "idle" || !Number.isFinite(ms) || ms <= 0) return;
    const target = Math.min(timeMs + ms, finishMs);
    if (phase === "magOut" && target >= magOutMs) {
      timeMs = magOutMs;
      reserve += mag;
      mag = 0;
      hasMagazine = false;
      phase = "waitCommit";
      record("removed");
    }
    if (phase === "waitCommit" && target >= commitMs) {
      timeMs = commitMs;
      const loaded = Math.min(magCapacity - mag, reserve);
      mag += loaded;
      reserve -= loaded;
      hasMagazine = true;
      committed = true;
      phase = "finish";
      record("committed");
    }
    timeMs = target;
    if (target === finishMs) {
      phase = "idle";
      record("completed");
    }
  }

  function reload() {
    let blocked: LogEvent | undefined;
    if (phase !== "idle") blocked = "busy";
    else if (reserve === 0) blocked = "noReserve";
    else if (mag === magCapacity) blocked = "full";
    else timeMs = 0;

    record("reload");
    if (blocked) return record(blocked);

    startedWithMag = mag;
    chamberAtStart = chamber;
    if (keepChamberRound && mag > 0 && chamber === 0) {
      mag -= 1;
      chamber = 1;
    }
    committed = false;
    phase = "magOut";
    record("started");
  }

  function cancel() {
    if (phase === "idle") return record("idleCancel");
    const interrupted = phase;
    phase = "idle";
    if (interrupted === "magOut") {
      mag = startedWithMag;
      chamber = chamberAtStart;
      record("beforeOut");
    } else {
      record(interrupted === "waitCommit" ? "beforeCommit" : "afterCommit");
    }
  }

  function input(kind: Command) {
    if (kind === "reload") return reload();
    record(kind);
    if (kind === "cancel") return cancel();
    if (phase !== "idle") cancel();
    if (mag > 0) {
      mag -= 1;
      record("firedMag");
    } else if (chamber === 1) {
      chamber = 0;
      record("firedChamber");
    } else {
      record("empty");
    }
  }

  resetDemo();
  return {
    advance, input, resetDemo,
    get phase() { return phase; },
    get timeMs() { return timeMs; },
    snapshot() {
      return {
        phase, timeMs, mag, reserve, chamber, hasMagazine, startedWithMag, committed,
        log: log.map(entry => ({ ...entry })),
        segments: { magOutMs, commitMs, finishMs },
      };
    },
  };
}
