// Ambient types for gifenc (ships without declarations). Only the API PixJuice uses.

declare module "gifenc" {
  export interface QuantizeOptions {
    /** Pixel format of the input RGBA data and palette. */
    format?: "rgb565" | "rgb444" | "rgba4444";
    /** Snap alpha to fully transparent or opaque. */
    oneBitAlpha?: boolean | number;
    /** Force a specific color into the palette (e.g. a transparent index). */
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  /** Per-frame encoding options. */
  export interface FrameOptions {
    palette?: number[][];
    delay?: number;
    /** -1 = once, 0 = forever, n = n-1 additional repeats. */
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GIFEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GIFEncoderInstance;

  /** Quantize RGBA data into a palette of at most maxColors entries. */
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: QuantizeOptions): number[][];

  /** Map RGBA data onto a palette, returning one palette index per pixel. */
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array;

  export function nearestColorIndex(palette: number[][], pixel: number[]): number;
  export function prequantize(rgba: Uint8Array | Uint8ClampedArray, options?: QuantizeOptions): void;
}
