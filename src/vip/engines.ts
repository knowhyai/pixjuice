// Engine-ready packs (VIP): Godot 4 SpriteFrames (.tres) and a Phaser atlas
// JSON, each bundled with the transparent sheet PNG, a short README and the
// pixelfx MIT license. Loaded as a VIP-only chunk after activation.

import { exportBase, frameCount, type CatalogEntry } from "../lib/catalog";
import { sheetJson, type RenderedFrames } from "../lib/exports";
import type { PlayerStyle } from "../lib/player";
import type { ZipEntry } from "../lib/zip";

/** Same grid the sheet uses, so every engine format agrees on the layout. */
function grid(r: RenderedFrames): { cols: number; rows: number } {
  const cols = Math.min(r.n, Math.max(1, Math.ceil(Math.sqrt((r.n * r.h) / r.w))));
  return { cols, rows: Math.ceil(r.n / cols) };
}

/** The Godot animation name — the effect's own short tag ("frost-nova"). */
function animName(entry: CatalogEntry): string {
  return entry.id.split("/")[1].replace(/[^a-z0-9-]/gi, "-");
}

/** Godot 4 SpriteFrames resource: one AtlasTexture per frame, one animation. */
function godotTres(entry: CatalogEntry, r: RenderedFrames, pngName: string): string {
  const { cols } = grid(r);
  const name = animName(entry);
  const lines: string[] = [];
  lines.push(`[gd_resource type="SpriteFrames" load_steps=${r.n + 2} format=3]`, "");
  lines.push(`[ext_resource type="Texture2D" path="res://${pngName}" id="1_sheet"]`, "");
  for (let i = 0; i < r.n; i++) {
    lines.push(`[sub_resource type="AtlasTexture" id="Atlas_${i}"]`);
    lines.push(`atlas = ExtResource("1_sheet")`);
    lines.push(`region = Rect2(${(i % cols) * r.w}, ${Math.floor(i / cols) * r.h}, ${r.w}, ${r.h})`);
    lines.push("");
  }
  lines.push("[resource]");
  lines.push("animations = [{");
  lines.push(`"frames": [`);
  const frames = Array.from({ length: r.n }, (_, i) =>
    `{"duration": 1.0, "texture": SubResource("Atlas_${i}")}`,
  );
  lines.push(frames.join(",\n"));
  lines.push(`],`);
  lines.push(`"loop": ${!!entry.meta.loop},`);
  lines.push(`"name": &"${name}",`);
  lines.push(`"speed": ${r.fps}`);
  lines.push("}]");
  return lines.join("\n") + "\n";
}

/** Phaser (and PixiJS) atlas JSON, TexturePacker hash format + animation list. */
function phaserAtlas(entry: CatalogEntry, r: RenderedFrames, pngName: string): string {
  const { cols, rows } = grid(r);
  const name = animName(entry);
  const frames: Record<string, unknown> = {};
  for (let i = 0; i < r.n; i++) {
    frames[`${name} ${i}`] = {
      frame: { x: (i % cols) * r.w, y: Math.floor(i / cols) * r.h, w: r.w, h: r.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
      sourceSize: { w: r.w, h: r.h },
      duration: Math.round(1000 / r.fps),
    };
  }
  const atlas = {
    frames,
    animations: { [name]: Object.keys(frames) },
    meta: {
      app: "PixJuice",
      version: "1",
      image: pngName,
      format: "RGBA8888",
      size: { w: cols * r.w, h: rows * r.h },
      scale: "1",
      frameTags: [{ name, from: 0, to: r.n - 1, direction: "forward" }],
    },
  };
  return `${JSON.stringify(atlas, null, 2)}\n`;
}

/** Short per-engine README (English — engine tooling language). */
function readme(entry: CatalogEntry, r: RenderedFrames, engine: "godot" | "phaser"): string {
  const base = exportBase(entry);
  const frames = frameCount(entry.meta);
  const common = `PixJuice engine pack — ${entry.meta.name} (${entry.id})
${frames} frames, ${r.w}x${r.h} px per frame, ${r.fps} fps, ${entry.meta.loop ? "looping" : "one-shot"}.
Effect art: pixelfx by Patch & Hugo Duprez, MIT — keep the included LICENSE.
`;
  if (engine === "godot") {
    return `${common}
Godot 4:
1. Copy ${base}.png and ${base}.tres into res:// (same folder).
2. Use the SpriteFrames with an AnimatedSprite2D:
   var frames = load("res://${base}.tres")
   var sprite = AnimatedSprite2D.new(); sprite.sprite_frames = frames
   sprite.play("${animName(entry)}")
The .tres references the PNG next to itself; AtlasTextures carry the grid.
`;
  }
  return `${common}
Phaser 3:
  this.load.atlas("${animName(entry)}", "${base}.png", "${base}.atlas.json");
  this.anims.create({ key: "${animName(entry)}", frames: this.anims.generateFrameNames("${animName(entry)}"), frameRate: ${r.fps}, repeat: ${entry.meta.loop ? -1 : 0} });
The same JSON also loads in PixiJS Assets via TexturePacker hash format.
`;
}

async function licenseFiles(): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  try {
    const lic = await (await fetch("/licenses/pixelfx-LICENSE.txt")).text();
    out.push({ name: "LICENSE-pixelfx.txt", data: new TextEncoder().encode(lic) });
  } catch {
    /* offline — the pack still works; the JSON sidecar credits the source */
  }
  return out;
}

/** ZIP entries for one engine pack (PNG bytes are rendered by the caller). */
export async function enginePack(
  engine: "godot" | "phaser",
  entry: CatalogEntry,
  r: RenderedFrames,
  style: PlayerStyle,
  png: Uint8Array,
): Promise<ZipEntry[]> {
  const base = exportBase(entry);
  const pngName = `${base}.png`;
  const files: ZipEntry[] = [{ name: pngName, data: png }];
  if (engine === "godot") {
    files.push({ name: `${base}.tres`, data: new TextEncoder().encode(godotTres(entry, r, pngName)) });
  } else {
    files.push({ name: `${base}.atlas.json`, data: new TextEncoder().encode(phaserAtlas(entry, r, pngName)) });
  }
  // The neutral Aseprite-style JSON rides along — engines and tools differ in
  // which sidecar they read, and it documents pivot, fps and the dials used.
  files.push({ name: `${base}.json`, data: new TextEncoder().encode(JSON.stringify(sheetJson(entry, r, pngName, style), null, 2)) });
  files.push({ name: `README-${engine.toUpperCase()}.md`, data: new TextEncoder().encode(readme(entry, r, engine)) });
  files.push(...(await licenseFiles()));
  return files;
}
