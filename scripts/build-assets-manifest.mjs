#!/usr/bin/env node
// Builds public/free-assets/ — the data behind the /scene/ builder sample.
//
//   node scripts/build-assets-manifest.mjs [--assets-dir /workspace/pixjuice-assets] [--out public/free-assets]
//
// From /workspace/pixjuice-assets/chest-wood it copies, per curated (style, palette, variant):
// LOD0/LOD1 GLB, the 128px 1-direction sprite sheets and a preview thumbnail — every file
// must stay under Cloudflare Pages' 25MB cap. FBX files are huge (8.5MB each, textures
// embedded), so by default only the flagship chest ships its FBX pair; the scene ZIP
// fetches whatever the manifest lists. Everything else (wall, floor, torch, barrel, gold
// pile) ships as `placeholder: true` procedural entries — swap in real files by editing
// CHESTS below and re-running, no page code changes needed.

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MAX_FILE = 25 * 1024 * 1024; // Cloudflare Pages per-file hard cap

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const ASSETS = flag("--assets-dir", "/workspace/pixjuice-assets");
const OUT = join(ROOT, flag("--out", "public/free-assets"));
const CHEST_ROOT = join(ASSETS, "chest-wood");

// [style, palette, variant, withFbx] — the flagship wood chest carries the FBX pair.
const CHESTS = [
  ["realistic", "wood", "intact", true],
  ["realistic", "gold", "intact", false],
  ["realistic", "blue", "intact", false],
  ["realistic", "red", "damaged", false],
  ["stylized", "wood", "intact", false],
  ["stylized", "gold", "intact", false],
  ["clean-low-poly", "wood", "intact", false],
  ["clean-low-poly", "gold", "intact", false],
  ["pixel-art", "wood", "intact", false],
  ["pixel-art", "gold", "intact", false],
];

// Placeholder entries rendered procedurally in three.js / canvas until real assets land.
const PLACEHOLDERS = [
  {
    id: "wall-stone",
    procedural: "wall",
    category: "structure",
    palette: "stone",
    name: { en: "Dungeon Stone Wall", zh: "地下城石墙" },
    tags: ["wall", "dungeon", "stone", "structure"],
  },
  {
    id: "floor-stone",
    procedural: "floor",
    category: "structure",
    palette: "stone",
    name: { en: "Dungeon Stone Floor", zh: "地下城石地板" },
    tags: ["floor", "dungeon", "stone", "structure"],
  },
  {
    id: "torch-wall",
    procedural: "torch",
    category: "lighting",
    palette: "iron",
    name: { en: "Wall Torch", zh: "墙上火把" },
    tags: ["torch", "fire", "lighting", "dungeon"],
  },
  {
    id: "barrel-wood",
    procedural: "barrel",
    category: "props",
    palette: "wood",
    name: { en: "Wooden Barrel", zh: "木桶" },
    tags: ["barrel", "wood", "props", "dungeon"],
  },
  {
    id: "gold-pile",
    procedural: "gold-pile",
    category: "props",
    palette: "gold",
    name: { en: "Gold Coin Pile", zh: "金币堆" },
    tags: ["gold", "coins", "loot", "props"],
  },
];

const SPRITE_CLIPS = ["idle", "open", "close", "locked_shake", "open_burst"];
const copied = [];
let total = 0;

async function copy(srcAbs, relDest) {
  const size = (await stat(srcAbs)).size;
  if (size >= MAX_FILE) {
    console.warn(`  ! skip (>${MAX_FILE >> 20}MB): ${srcAbs}`);
    return null;
  }
  const dest = join(OUT, relDest);
  await mkdir(dirname(dest), { recursive: true });
  await cp(srcAbs, dest);
  copied.push(relDest);
  total += size;
  return relDest;
}

function fmt(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${(n / 1024).toFixed(0)}KB`;
}

// ---- curate the chest entries -----------------------------------------------------------

async function buildChestEntry([style, palette, variant, withFbx]) {
  const srcDir = join(CHEST_ROOT, style, "models", palette, variant);
  const meta = JSON.parse(await readFile(join(srcDir, "meta.json"), "utf8"));
  const base = `chest-wood/${style}/${palette}/${variant}`;

  const glb = {
    lod0: await copy(join(srcDir, "chest_LOD0.glb"), `${base}/chest_LOD0.glb`),
    lod1: await copy(join(srcDir, "chest_LOD1.glb"), `${base}/chest_LOD1.glb`),
  };
  const sprites = {};
  for (const clip of SPRITE_CLIPS) {
    const src = join(CHEST_ROOT, style, "sprites", palette, variant, "128px", "1dir", `${clip}.png`);
    sprites[clip] = await copy(src, `${base}/sprites/${clip}.png`);
  }
  const thumb = await copy(
    join(CHEST_ROOT, style, "previews", `${palette}_${variant}_open.png`),
    `${base}/thumb.png`,
  );
  const fbx = [];
  if (withFbx) {
    for (const lod of ["LOD0", "LOD1"]) {
      const rel = await copy(join(srcDir, "fbx", `chest_${lod}.fbx`), `${base}/fbx/chest_${lod}.fbx`);
      if (rel) fbx.push(rel);
    }
  }
  const license = `chest-wood/${style}/LICENSE.txt`;
  await mkdir(dirname(join(OUT, license)), {recursive:true});
  await writeFile(join(OUT, license), `PixJuice Free Assets — Wooden Chest #1
CC0 1.0 Universal

To the extent possible under law, PixJuice has waived all copyright and
related or neighboring rights to this work worldwide under CC0 1.0 Universal.
You may copy, modify, distribute and sell this work, including for commercial
purposes, without asking permission or providing attribution.
This work is provided without warranty. No trademark or patent rights are waived.
https://creativecommons.org/publicdomain/zero/1.0/
`);

  return {
    id: meta.id,
    name: { en: meta.name.en, zh: meta.name.zh },
    category: "props",
    style_tier: style,
    palette,
    tags: meta.tags.filter((t) => !t.startsWith("pixjuice-")).slice(0, 12),
    placeholder: false,
    animations: meta.animations ?? [],
    glb,
    fbx,
    sprites,
    thumb,
    license: { id: "CC0 1.0", file: license, commercial_use: true },
    dimensions_m: meta.dimensions_m ?? null,
    polycount_lod0: meta.polycount_lod0 ?? null,
  };
}

// ---- go ---------------------------------------------------------------------------------

const styleGuide = await readFile(join(ASSETS, "taxonomy.md"), "utf8").catch(() => "");
if (!styleGuide) console.warn("(note) taxonomy.md not found — continuing anyway");

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const chestEntries = [];
for (const c of CHESTS) {
  const entry = await buildChestEntry(c);
  if (entry.glb.lod0) chestEntries.push(entry);
}

const placeholderEntries = PLACEHOLDERS.map((p) => ({
  ...p,
  style_tier: "procedural",
  placeholder: true,
  animations: [],
  glb: null,
  fbx: [],
  sprites: null,
  thumb: null,
  license: { id: "CC0 1.0", file: null, commercial_use: true },
  dimensions_m: null,
  polycount_lod0: null,
}));

const manifest = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  base: "/free-assets/",
  note: "Curated sample of chest-wood outputs; placeholder entries render procedurally until real assets land. Regenerate with scripts/build-assets-manifest.mjs.",
  assets: [...chestEntries, ...placeholderEntries],
};

await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const byId = Object.groupBy(copied, (f) => f.split("/")[1]);
console.log(`manifest.json: ${manifest.assets.length} entries (${chestEntries.length} chest + ${placeholderEntries.length} placeholder)`);
for (const [style, files] of Object.entries(byId ?? {}))
  console.log(`  ${style}: ${files.length} files`);
console.log(`copied ${copied.length} files, ${fmt(total)} total -> ${OUT}`);
