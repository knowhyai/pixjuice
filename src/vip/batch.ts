// The VIP batch pack: every effect in a category (or the whole library) as
// PNG sheets + Aseprite-style JSON, optionally with each effect's matching
// WAV sound and a Godot or Phaser engine pack per effect. Everything renders
// in the browser like the single-effect exports; this chunk only loads after
// activation. A manifest + the pixelfx MIT license ride along in the ZIP.

import { CATALOG, exportBase } from "../lib/catalog";
import { defaultStyle } from "../lib/player";
import { canvasToBlob, renderBareFrames, sheetCanvas, sheetJson } from "../lib/exports";
import { makeZipDeflated, type ZipEntry } from "../lib/zip";
import { SfxEngine, familyForCategory } from "../lib/sfx";
import { enginePack } from "./engines";

export interface BatchOptions {
  /** Category id, or "all" for the whole library. */
  cat: string;
  /** Include each effect's matching WAV. */
  sfx: boolean;
  /** Per-effect engine pack (none/godot/phaser). */
  engine: "none" | "godot" | "phaser";
  onProgress?: (done: number, total: number, name: string) => void;
}

/** Same stable per-effect fallback seed the editor uses, so packs sound right. */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function buildBatchZip(opts: BatchOptions): Promise<Blob> {
  const list = opts.cat === "all" ? CATALOG : CATALOG.filter((f) => f.cat === opts.cat);
  const sfx = opts.sfx ? new SfxEngine() : null;
  const entries: ZipEntry[] = [];
  const manifest: unknown[] = [];

  let license: ZipEntry | null = null;
  try {
    const text = await (await fetch("/licenses/pixelfx-LICENSE.txt")).text();
    license = { name: "LICENSE-pixelfx.txt", data: new TextEncoder().encode(text) };
  } catch {
    /* offline — the JSON sidecars still credit the source */
  }

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const style = defaultStyle(entry);
    const r = renderBareFrames(entry, style);
    const base = exportBase(entry);
    const pngName = `${base}.png`;
    opts.onProgress?.(i, list.length, entry.id);
    const png = new Uint8Array(await (await canvasToBlob(sheetCanvas(r))).arrayBuffer());
    const folder = `${entry.cat}/`;
    const files: string[] = [];
    entries.push({ name: folder + pngName, data: png });
    files.push(folder + pngName);
    const jsonName = folder + `${base}.json`;
    entries.push({
      name: jsonName,
      data: new TextEncoder().encode(JSON.stringify(sheetJson(entry, r, pngName, style), null, 2)),
    });
    files.push(jsonName);
    if (sfx) {
      const wav = await sfx.renderWav(familyForCategory(entry.cat), hashSeed(entry.id));
      const wavName = folder + `${base}.wav`;
      entries.push({ name: wavName, data: new Uint8Array(await wav.arrayBuffer()) });
      files.push(wavName);
    }
    if (opts.engine !== "none") {
      const pack = await enginePack(opts.engine, entry, r, style, png);
      entries.push(...pack);
      files.push(...pack.map((f) => f.name));
    }
    manifest.push({
      id: entry.id,
      name: entry.meta.name,
      category: entry.cat,
      size: [r.w, r.h],
      frames: r.n,
      fps: r.fps,
      loop: !!entry.meta.loop,
      files,
    });
    await new Promise((res) => setTimeout(res, 0)); // keep the UI responsive
  }
  opts.onProgress?.(list.length, list.length, "");

  entries.push({
    name: "index.json",
    data: new TextEncoder().encode(
      JSON.stringify(
        {
          app: "PixJuice",
          url: "https://pixjuice.pages.dev",
          generated: new Date().toISOString(),
          category: opts.cat,
          count: list.length,
          options: { sfx: opts.sfx, engine: opts.engine },
          effects: manifest,
          license: "Effects are pixelfx by Patch & Hugo Duprez, MIT — see LICENSE-pixelfx.txt",
        },
        null,
        2,
      ),
    ),
  });
  if (license) entries.push(license);
  return makeZipDeflated(entries);
}
