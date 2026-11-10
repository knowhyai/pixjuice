// Quick check that every pixelfx effect category maps to a working jsfxr preset.
// Run directly with Node (it strips the TS types in src/lib/sfx.ts); wired into `pnpm build`.

import { categories } from "pixelfx/fx/categories";
import {
  CATEGORY_FAMILIES,
  FALLBACK_FAMILY,
  SFX_FAMILIES,
  rollParams,
  sfxDuration,
} from "../src/lib/sfx.ts";
import { sfxr } from "jsfxr";

let failed = 0;
function fail(msg) {
  failed++;
  console.error(`  ✗ ${msg}`);
}

// 1. every real category must have an explicit family entry
for (const cat of categories) {
  const fam = CATEGORY_FAMILIES[cat.id];
  if (!fam) fail(`category "${cat.id}" has no family mapping`);
  else if (!SFX_FAMILIES.includes(fam)) fail(`category "${cat.id}" maps to unknown family "${fam}"`);
}

// 2. the fallback must exist too
if (!SFX_FAMILIES.includes(FALLBACK_FAMILY)) fail(`fallback family "${FALLBACK_FAMILY}" has no preset`);

// 3. every family's preset must roll complete, in-range params and render actual samples
const REQUIRED_KEYS = [
  "wave_type", "p_env_attack", "p_env_sustain", "p_env_punch", "p_env_decay",
  "p_base_freq", "p_freq_limit", "p_freq_ramp", "p_freq_dramp",
  "p_vib_strength", "p_vib_speed", "p_arp_mod", "p_arp_speed",
  "p_duty", "p_duty_ramp", "p_repeat_speed",
  "p_pha_offset", "p_pha_ramp",
  "p_lpf_freq", "p_lpf_ramp", "p_lpf_resonance", "p_hpf_freq", "p_hpf_ramp",
  "sound_vol", "sample_rate", "sample_size",
];

for (const fam of SFX_FAMILIES) {
  const p = rollParams(fam, 12345);
  for (const k of REQUIRED_KEYS) {
    const v = p[k];
    if (typeof v !== "number" || Number.isNaN(v)) fail(`${fam}: param "${k}" is not a number (${v})`);
  }
  if (!(p.wave_type >= 0 && p.wave_type <= 3)) fail(`${fam}: bad wave_type ${p.wave_type}`);
  if (p.p_env_attack + p.p_env_sustain + p.p_env_decay <= 0) fail(`${fam}: envelope is empty (infinite render)`);
  const dur = sfxDuration(p);
  if (!(dur > 0 && dur < 8)) fail(`${fam}: implausible duration ${dur.toFixed(2)}s`);
  const buf = sfxr.toBuffer(p);
  if (!buf.length) fail(`${fam}: rendered zero samples`);
  // every category the app knows must end up on a family that works — spot-check a few seeds per family
  for (const seed of [0, 1, 7919, 987654321]) {
    if (!sfxr.toBuffer(rollParams(fam, seed)).length) fail(`${fam}: rendered zero samples at seed ${seed}`);
  }
}

if (failed) {
  console.error(`sfx presets check FAILED: ${failed} problem${failed > 1 ? "s" : ""}`);
  process.exit(1);
}
console.log(`✓ sfx presets: ${categories.length} categories mapped, ${SFX_FAMILIES.length} families render (incl. fallback)`);
