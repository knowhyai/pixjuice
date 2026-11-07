// Ambient declarations for the pixelfx library (plain JS, no upstream types).
// Mirrors the parts of https://github.com/patch-gg/pixelfx that PixJuice uses.

declare module "pixelfx" {
  /** An effect's metadata block: every file in src/fx exports one. */
  export interface FxMeta {
    name: string;
    desc?: string;
    tags?: string[];
    size: [number, number];
    origin: [number, number];
    duration: number;
    loop?: boolean;
    fps?: number;
    bg?: string;
    actor?: 1 | 2;
    options?: Record<string, unknown> & { palette?: string[]; seed?: number };
  }

  /** An effect module: `meta` plus either a pure `draw` or a simulated `create`. */
  export interface FxModule {
    meta?: FxMeta;
    draw?: (p: Painter, t: number, o?: Record<string, unknown>) => void;
    create?: (o?: Record<string, unknown>) => unknown;
    act?: ActData;
    actorAlpha?: (t: number, o?: Record<string, unknown>) => number;
  }

  export interface ActData {
    poses?: [number, unknown, string?][];
    hits?: Record<string, unknown>[];
    target?: { x?: number };
    targets?: { x?: number }[];
  }

  /** The painter effects draw through; only placement + actor drawing are used here. */
  export interface Painter {
    place(x: number, y: number, flip?: boolean, angle?: number): Painter;
    [key: string]: unknown;
  }

  /** A pixel frame: color pixels plus additive light, both w*h. */
  export interface Frame {
    w: number;
    h: number;
    ox: number;
    oy: number;
    color: Uint32Array;
    light: Uint32Array;
  }

  export interface FxOptions {
    x?: number;
    y?: number;
    flip?: boolean;
    angle?: number;
    seed?: number;
    palette?: string[];
    light?: number;
    actor?: unknown;
    [key: string]: unknown;
  }

  export interface FxInstance {
    meta: FxMeta;
    options: FxOptions;
    readonly t: number;
    update(dt: number): void;
    draw(frame: Frame, layer?: "back" | "front"): void;
    stop(): void;
    done(): boolean;
  }

  export interface ActInstance {
    fx: FxInstance;
    readonly t: number;
    readonly frozen: boolean;
    readonly shake: [number, number];
    update(dt: number): void;
    draw(frame: Frame, o?: { body?: boolean; target?: boolean }): void;
    done(): boolean;
  }

  export interface StockActor {
    k?: 1 | 2;
    x?: number;
    y?: number;
  }

  export interface ActTiming {
    windup: number;
    recovery: number;
    onBody: boolean;
    targets: number[];
    hits: { t: number; freeze: number; shake: number; amp: number; push: number }[];
    poses: { t: number; how: string; pose: unknown }[];
  }

  export function createFrame(w: number, h: number, ox?: number, oy?: number): Frame;
  export function clearFrame(f: Frame): Frame;
  export function createFx(mod: FxModule, o?: FxOptions): FxInstance;
  export function createAct(mod: FxModule, o?: FxOptions): ActInstance;
  export function composite(
    f: Frame,
    out: Uint8ClampedArray | Uint8Array,
    bg?: Uint32Array | number | null,
    lightK?: number
  ): Uint8ClampedArray | Uint8Array;
  export function painterFor(frame: Frame): Painter;
  export function backdrop(kind: string, w: number, h: number, groundY?: number): Uint32Array;
  export function drawActor(p: Painter, actor: StockActor, alpha?: number): void;
  export function stockActor(k?: 1 | 2): StockActor;
  export function actorAlphaOf(mod: FxModule, t: number, o?: Record<string, unknown>): number;
  export function actBounds(mod: FxModule): { x0: number; y0: number; x1: number; y1: number };
  export function actTiming(mod: FxModule): ActTiming | null;

  /** Preset color ramps (dark to bright), usable as any effect's `palette` option. */
  export const PAL: Record<string, string[]>;
  export const BACKDROPS: string[];
}

// The generated registry of every effect, by id. (Imported extensionless: the package's
// exports map "./fx/*" already appends .js, so "pixelfx/fx/index" -> src/fx/index.js.)
declare module "pixelfx/fx/index" {
  import type { FxModule } from "pixelfx";
  export const effects: Record<string, FxModule>;
  export const categories: { id: string; name: string; blurb: string }[];
}

// A single effect, e.g. `import * as nova from "pixelfx/fx/ice/frost-nova"`.
declare module "pixelfx/fx/*" {
  import type { ActData, FxMeta, Painter } from "pixelfx";
  export const meta: FxMeta;
  export const act: ActData | undefined;
  export const actorAlpha: ((t: number, o?: Record<string, unknown>) => number) | undefined;
  export const draw: ((p: Painter, t: number, o?: Record<string, unknown>) => void) | undefined;
  export const create: ((o?: Record<string, unknown>) => unknown) | undefined;
}
