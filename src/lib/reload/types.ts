export interface ReloadParams {
  magCapacity: number;
  startMag: number;
  startReserve: number;
  magOutMs: number;
  commitMs: number;
  finishMs: number;
  keepChamberRound: boolean;
}

export type Mode = "default" | "mine";
export type Phase = "idle" | "magOut" | "waitCommit" | "finish";
export type Command = "fire" | "reload" | "cancel";
export type LogEvent = Command | "started" | "removed" | "committed" | "completed"
  | "busy" | "noReserve" | "full" | "idleCancel" | "beforeOut" | "beforeCommit"
  | "afterCommit" | "firedMag" | "firedChamber" | "empty";

export interface LogEntry {
  event: LogEvent;
  timeMs: number;
  mag: number;
  reserve: number;
  chamber: number;
}

export interface LabState {
  mine: ReloadParams;
  mode: Mode;
}
