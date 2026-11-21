export const JUMP_DEFAULTS = Object.freeze({
  coyoteEnabled: true,
  coyoteMs: 120,
  bufferEnabled: true,
  bufferMs: 120,
  variableHeight: true,
  releaseSpeed: 170,
  gravity: 780,
  jumpSpeed: 420,
});

export type JumpParams = { -readonly [K in keyof typeof JUMP_DEFAULTS]: (typeof JUMP_DEFAULTS)[K] extends boolean ? boolean : number };
export const JUMP_LIMITS = {
  coyoteMs: [0, 250, 5],
  bufferMs: [0, 250, 5],
  releaseSpeed: [80, 300, 10],
  gravity: [550, 1400, 10],
  jumpSpeed: [320, 520, 10],
} as const;

export const ROOM = { width: 480, height: 256, floor: 234, ledge: { left: 16, right: 158, y: 144 } };
const SPEED = 190;
export const STEP = 1 / 120;

export type JumpResult = "ready" | "grounded" | "coyote" | "buffer" | "pending" | "ignored";
export type JumpAction = "left" | "right" | "jump";
export type JumpInput = { direction: number; pressed: boolean; held: boolean };

export class JumpControls {
  private sources = new Map<string, JumpAction>();
  private pressed = false;
  private tapDirection = 0;

  down(source: string, action: JumpAction): void {
    if (action === "jump" && !this.has("jump")) this.pressed = true;
    this.sources.set(source, action);
  }

  up(source: string): void {
    this.sources.delete(source);
  }

  tap(action: JumpAction): void {
    if (action === "jump") this.pressed ||= !this.has("jump");
    else this.tapDirection = action === "left" ? -1 : 1;
  }

  clear(): void {
    this.sources.clear();
    this.pressed = false;
    this.tapDirection = 0;
  }

  has(action: JumpAction): boolean {
    for (const held of this.sources.values()) if (held === action) return true;
    return false;
  }

  sample(): JumpInput {
    const input = {
      direction: this.tapDirection || Number(this.has("right")) - Number(this.has("left")),
      pressed: this.pressed,
      held: this.has("jump"),
    };
    this.pressed = false;
    this.tapDirection = 0;
    return input;
  }
}

export class JumpRoom {
  x = 115;
  y = ROOM.ledge.y;
  vy = 0;
  grounded = true;
  consumed = false;
  sinceEdge: number | null = null;
  coyote = 0;
  buffer = 0;
  result: JumpResult = "ready";
  jumps = 0;

  reset(landingTrial = false): void {
    Object.assign(this, new JumpRoom());
    if (landingTrial) {
      this.x = 308;
      this.y = ROOM.floor - 124;
      this.grounded = false;
      this.consumed = true;
    }
  }

  private launch(params: JumpParams, result: "grounded" | "coyote" | "buffer"): void {
    this.vy = -params.jumpSpeed;
    this.grounded = false;
    this.consumed = true;
    this.coyote = 0;
    this.buffer = 0;
    this.result = result;
    this.jumps++;
  }

  step(params: JumpParams, input: JumpInput): void {
    const coyoteWindow = params.coyoteEnabled ? params.coyoteMs / 1000 : 0;
    const bufferWindow = params.bufferEnabled ? params.bufferMs / 1000 : 0;
    this.coyote = Math.min(this.coyote, coyoteWindow);
    this.buffer = Math.min(this.buffer, bufferWindow);
    if (this.sinceEdge !== null) this.sinceEdge += STEP;

    const launched = input.pressed && !this.consumed && (this.grounded || this.coyote > 0);
    if (launched) {
      this.launch(params, this.grounded ? "grounded" : "coyote");
    } else {
      this.coyote = Math.max(0, this.coyote - STEP);
      this.buffer = Math.max(0, this.buffer - STEP);
      if (input.pressed) this.buffer = bufferWindow;
    }

    // A descending foot point crosses a surface at its real X coordinate.
    // Only a walk-off opens coyote time. Launching has already cleared grounded.
    const wasGrounded = this.grounded;
    const wasY = this.y;
    this.x = Math.max(7, Math.min(ROOM.width - 7, this.x + input.direction * SPEED * STEP));
    const onLedge = this.x >= ROOM.ledge.left && this.x <= ROOM.ledge.right;
    const surface = onLedge && wasY <= ROOM.ledge.y ? ROOM.ledge.y : ROOM.floor;
    if (params.variableHeight && !input.held) this.vy = Math.max(this.vy, -params.releaseSpeed);
    this.vy += params.gravity * STEP;
    this.y += this.vy * STEP;
    if (this.y < 24) {
      this.y = 24;
      this.vy = 0;
    }
    this.grounded = this.vy >= 0 && this.y >= surface;
    if (this.grounded) {
      this.y = surface;
      this.vy = 0;
      this.consumed = false;
      this.coyote = 0;
      this.sinceEdge = null;
      if (input.pressed && !launched) {
        this.launch(params, "grounded");
        return;
      }
      if (this.buffer > 0) {
        this.launch(params, "buffer");
        return;
      }
    } else if (wasGrounded && !this.consumed) {
      this.sinceEdge = 0;
      this.coyote = coyoteWindow;
    }

    if (input.pressed && !launched) this.result = this.buffer > 0 ? "pending" : "ignored";
    if (this.result === "pending" && this.buffer === 0) this.result = "ignored";
  }
}

/** Advance a fixed 120 Hz clock, dropping wall time beyond 100 ms per render. */
export class JumpClock {
  private remainder = 0;
  reset(): void { this.remainder = 0; }

  advance(seconds: number, step: () => void): void {
    this.remainder += Math.max(0, Math.min(seconds, 0.1));
    while (this.remainder + 1e-9 >= STEP) {
      this.remainder -= STEP;
      step();
    }
  }
}

export type JumpTrialKind = "edge" | "landing";

/** One actual press through the regular simulation at a repeatable time. */
export class JumpTrial {
  private elapsed = 0;
  private pressedAt: number | null = null;

  constructor(private readonly kind: JumpTrialKind) {}

  input(room: JumpRoom, params: JumpParams): JumpInput {
    this.elapsed += STEP;
    // With semi-implicit Euler, this predicts the drop over exactly eight more steps.
    const lead = 8 * STEP;
    const drop = room.vy * lead + params.gravity * lead * (lead + STEP) / 2;
    const atCue = this.kind === "edge" ? (room.sinceEdge ?? -1) + 1e-9 >= 0.075 : room.y + drop >= ROOM.floor;
    const pressed = this.pressedAt === null && atCue;
    if (pressed) this.pressedAt = this.elapsed;
    return {
      direction: this.kind === "edge" && this.elapsed < 0.75 ? 1 : 0,
      pressed,
      held: this.pressedAt !== null && this.elapsed - this.pressedAt < 0.24,
    };
  }

  get done(): boolean { return this.elapsed >= 1.35; }
}

export function serializeJumpTune(tune: JumpParams): string {
  return `jump1:${JSON.stringify(tune)}`;
}

/** Jump's JSON token is read directly from the query, outside the Hit/Boss codecs. */
export function readJumpTune(search: string): JumpParams {
  const defaults = (): JumpParams => ({ ...JUMP_DEFAULTS });
  const token = new URLSearchParams(search).get("tune");
  if (!token?.startsWith("jump1:") || token.length > 512) return defaults();
  const tune = defaults();
  try {
    const data = JSON.parse(token.slice(6)) as Record<string, unknown> | null;
    if (!data) return defaults();
    for (const key of ["coyoteEnabled", "bufferEnabled", "variableHeight"] as const) {
      const value = data[key];
      if (typeof value !== "boolean") return defaults();
      tune[key] = value;
    }
    for (const key of Object.keys(JUMP_LIMITS) as (keyof typeof JUMP_LIMITS)[]) {
      const value = data[key];
      const [min, max, step] = JUMP_LIMITS[key];
      if (typeof value !== "number" || value < min || value > max || (value - min) % step !== 0) {
        return defaults();
      }
      tune[key] = value;
    }
    return tune;
  } catch {
    return defaults();
  }
}

export type JumpMode = "mine" | "default" | "off";
const timersOff = { ...JUMP_DEFAULTS, coyoteEnabled: false, bufferEnabled: false, coyoteMs: 0, bufferMs: 0 };

export function jumpParamsForMode(tune: JumpParams, mode: JumpMode): JumpParams {
  return mode === "mine" ? tune : mode === "default" ? JUMP_DEFAULTS : timersOff;
}
