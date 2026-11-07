// The editor: one effect on stage, every dial within reach. Changes render live and export as real files.

import "./style.css";
import { PAL, BACKDROPS } from "pixelfx";
import {
  actFacts,
  defaultPalette,
  exportBase,
  findFx,
  frameCount,
  isScreen,
  type CatalogEntry,
} from "./lib/catalog";
import { Player, defaultStyle } from "./lib/player";
import {
  buildGif,
  canvasToBlob,
  download,
  renderBareFrameAt,
  renderBareFrames,
  sheetCanvas,
  sheetJson,
} from "./lib/exports";
import { makeZip } from "./lib/zip";
import { familyForCategory, familyLabel, sfx, type SfxFamily } from "./lib/sfx";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  kids: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

// Palette presets: upstream ramps, two renamed for the menu ("poison" → toxic, "stone" → mono).
const PRESETS: { value: string; label: string }[] = (
  [
    ["fire", "fire"], ["ember", "ember"], ["lava", "lava"], ["ice", "ice"], ["water", "water"],
    ["electric", "electric"], ["volt", "volt"], ["poison", "toxic"], ["holy", "holy"], ["heal", "heal"],
    ["arcane", "arcane"], ["shadow", "shadow"], ["blood", "blood"], ["gold", "gold"], ["leaf", "leaf"],
    ["wood", "wood"], ["earth", "earth"], ["stone", "mono"], ["metal", "metal"], ["bone", "bone"],
    ["neon", "neon"], ["cyber", "cyber"], ["matrix", "matrix"], ["candy", "candy"], ["smoke", "smoke"],
    ["dust", "dust"], ["night", "night"],
  ] as [string, string][]
).map(([value, label]) => ({ value, label }));

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.replace("#", "").slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
/** A 9-stop dark-to-bright ramp through the three custom picks, shaped like the upstream ramps. */
function rampFrom3(a: string, b: string, c: string): string[] {
  return Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return t < 0.5 ? mixHex(a, b, t * 2) : mixHex(b, c, (t - 0.5) * 2);
  });
}
/** First / middle / last stop of a ramp — what the three custom color inputs show. */
function anchors(ramp: string[]): [string, string, string] {
  return [ramp[0], ramp[Math.floor((ramp.length - 1) / 2)], ramp[ramp.length - 1]];
}

/** FNV-1a: a stable per-effect fallback seed, so an effect always sounds like itself. */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fail(id: string | null): void {
  $("#ed-error").hidden = false;
  $("#ed-grid").hidden = true;
  $("#ed-error-msg").textContent = id ? `No effect named “${id}”.` : "No effect selected — pick one from the catalog.";
  $("#ed-crumb").textContent = "editor — not found";
  document.title = "Not found — PixJuice editor";
}

function runEditor(entry: CatalogEntry): void {
  const meta = entry.meta;
  const base = exportBase(entry);
  const family: SfxFamily = familyForCategory(entry.cat);
  const wide = isScreen(meta);
  const ASPECT = wide ? 16 / 9 : 6 / 5;
  const PAD = wide ? 1 : 1.25;

  document.title = `${meta.name} — PixJuice editor`;
  $("#ed-crumb").textContent = entry.id;
  $("#fx-desc").textContent = meta.desc ?? "";

  const rows: [string, string][] = [
    ["size", `${meta.size[0]} × ${meta.size[1]}`],
    ["fps", String(meta.fps ?? 30)],
    ["length", meta.loop ? `loop · ${meta.duration.toFixed(2)}s` : `${meta.duration.toFixed(2)}s`],
    ["frames", String(frameCount(meta))],
  ];
  if (entry.mod.act) rows.push(["act", actFacts(entry.mod, meta)]);
  if (meta.tags?.length) rows.push(["tags", meta.tags.join(", ")]);
  $("#fx-facts").replaceChildren(
    ...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]),
  );

  // ---- stage

  const style = defaultStyle(entry);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) style.playing = false;
  const player = new Player($("#stage") as HTMLCanvasElement, entry, ASPECT, PAD, style);
  if (reduced) player.seek(meta.duration * 0.4);

  const homeSeed = hashSeed(entry.id);
  const sfxSeed = () => style.seed ?? homeSeed;

  /** Recreate the effect instance without firing the synced SFX (palette tweaks aren't restarts). */
  function quietRefresh() {
    const cb = player.onRestart;
    player.onRestart = null;
    player.refresh();
    player.onRestart = cb;
  }

  // ---- transport

  const playBtn = $<HTMLButtonElement>("#play");
  const scrub = $<HTMLInputElement>("#scrub");
  const timeLbl = $("#time");
  let scrubbing = false;

  function shownT(): number {
    const { from, to } = player.span();
    return meta.loop ? ((player.t % to) + to) % to : Math.min(Math.max(player.t, from), to);
  }

  function syncTransport() {
    const { from, to } = player.span();
    timeLbl.textContent = `${shownT().toFixed(2)}s / ${to.toFixed(2)}s`;
    if (!scrubbing) scrub.value = String(Math.round(((shownT() - from) / (to - from || 1)) * 1000));
  }

  scrub.addEventListener("focus", () => (scrubbing = true));
  scrub.addEventListener("blur", () => (scrubbing = false));
  scrub.addEventListener("input", () => {
    const { from, to } = player.span();
    player.seek(from + ((to - from) * +scrub.value) / 1000);
  });

  function setPlaying(p: boolean) {
    style.playing = p;
    playBtn.textContent = p ? "⏸ pause" : "▶ play";
    playBtn.setAttribute("aria-pressed", String(p));
  }
  playBtn.addEventListener("click", () => setPlaying(!style.playing));
  $("#replay-btn").addEventListener("click", () => {
    setPlaying(true);
    player.restart();
  });

  // ---- look: palette

  const pal = $<HTMLSelectElement>("#pal");
  const swatches = $("#swatches");
  const custom = ["#c0", "#c1", "#c2"].map((s) => $<HTMLInputElement>(s));

  pal.append(
    el("option", { value: "", textContent: `default (${meta.name})` }),
    ...PRESETS.map((p) => el("option", { value: p.value, textContent: p.label })),
    el("option", { value: "custom", textContent: "custom (3 picks)" }),
  );

  function currentRamp(): string[] | null {
    return style.palette ?? defaultPalette(entry);
  }
  function paintSwatches() {
    swatches.replaceChildren(
      ...(currentRamp() ?? []).map((c) => {
        const i = document.createElement("i");
        i.style.background = c;
        return i;
      }),
    );
  }
  function syncCustomInputs() {
    const ramp = currentRamp();
    if (!ramp?.length) return;
    const [a, m, z] = anchors(ramp);
    custom[0].value = a;
    custom[1].value = m;
    custom[2].value = z;
  }
  /** The one recolor path: swap the palette, re-render now (works while paused too). */
  function applyPalette(p: string[] | null) {
    style.palette = p;
    quietRefresh();
    paintSwatches();
    syncCustomInputs();
  }
  function applyCustom() {
    applyPalette(rampFrom3(custom[0].value, custom[1].value, custom[2].value));
  }
  pal.addEventListener("change", () => {
    if (pal.value === "") applyPalette(null);
    else if (pal.value === "custom") applyCustom();
    else applyPalette(PAL[pal.value]);
  });
  for (const c of custom)
    c.addEventListener("input", () => {
      pal.value = "custom";
      applyCustom();
    });
  $("#pal-reset").addEventListener("click", () => {
    pal.value = "";
    applyPalette(null);
  });
  paintSwatches();
  syncCustomInputs();

  // ---- look: seed, mirror, angle, glow

  const seedIn = $<HTMLInputElement>("#seed");
  seedIn.addEventListener("input", () => {
    const n = Math.round(+seedIn.value);
    style.seed = seedIn.value !== "" && !Number.isNaN(n) ? Math.max(0, Math.min(999_999, n)) : null;
    quietRefresh();
  });
  $("#dice").addEventListener("click", () => {
    seedIn.value = String(Math.floor(Math.random() * 1_000_000));
    style.seed = +seedIn.value;
    quietRefresh();
  });

  for (const [btn, key] of [
    [$<HTMLButtonElement>("#flip-h"), "flipH"],
    [$<HTMLButtonElement>("#flip-v"), "flipV"],
  ] as [HTMLButtonElement, "flipH" | "flipV"][]) {
    btn.addEventListener("click", () => {
      style[key] = !style[key];
      btn.setAttribute("aria-pressed", String(style[key]));
      quietRefresh();
    });
  }

  const angle = $<HTMLInputElement>("#angle");
  const angleVal = $("#angle-val");
  angle.addEventListener("input", () => {
    style.angle = +angle.value;
    angleVal.textContent = `${angle.value}°`;
    quietRefresh();
  });

  const glow = $<HTMLInputElement>("#glow");
  const glowVal = $("#glow-val");
  glow.addEventListener("input", () => {
    style.light = +glow.value;
    glowVal.textContent = (+glow.value).toFixed(2);
    quietRefresh();
  });

  // ---- look: backdrop, character, replay, speed

  const bgs = $("#bgs");
  const BG_KINDS = ["none", ...BACKDROPS];
  for (const kind of BG_KINDS) {
    const b = el("button", { className: "btn", type: "button", textContent: kind });
    b.addEventListener("click", () => {
      player.setBg(kind);
      syncBg();
    });
    bgs.append(b);
  }
  function syncBg() {
    [...bgs.children].forEach((b, i) =>
      (b as HTMLButtonElement).setAttribute("aria-pressed", String(BG_KINDS[i] === style.backdrop)),
    );
  }
  syncBg();

  const actorRow = $("#actor-row");
  const actorBtn = $<HTMLButtonElement>("#actor");
  if (!entry.mod.act && !meta.actor) actorRow.hidden = true;
  function syncActor() {
    actorBtn.setAttribute("aria-pressed", String(style.actor));
    actorBtn.textContent = style.actor ? "shown" : "hidden";
  }
  actorBtn.addEventListener("click", () => {
    style.actor = !style.actor;
    syncActor();
    player.layout(ASPECT, PAD); // acting vs. lone fx changes the stage geometry
  });
  syncActor();

  const replayRow = $("#replay-row");
  const replayBtn = $<HTMLButtonElement>("#replay");
  if (meta.loop) replayRow.hidden = true; // loops don't need auto-replay
  replayBtn.addEventListener("click", () => {
    style.replay = !style.replay;
    replayBtn.setAttribute("aria-pressed", String(style.replay));
    replayBtn.textContent = style.replay ? "auto" : "off";
  });

  const speed = el("input", { type: "range", min: "0.25", max: "3", step: "0.25", value: "1" });
  const speedVal = el("span", { className: "val", textContent: "1.00×" });
  speed.addEventListener("input", () => {
    style.speed = +speed.value;
    speedVal.textContent = `${(+speed.value).toFixed(2)}×`;
  });
  $("#look-panel").append(
    el("div", { className: "row" }, [
      el("label", { textContent: "speed" }),
      speed,
      speedVal,
    ]),
  );

  // ---- sound

  $("#sfx-family").textContent = `${familyLabel(family)} · ${family}`;
  let syncOnRestart = true;
  const syncBtn = $<HTMLButtonElement>("#sfx-sync");
  const muteBtn = $<HTMLButtonElement>("#sfx-mute");
  $<HTMLButtonElement>("#sfx-play").addEventListener("click", () => {
    sfx.ensure();
    sfx.play(family, sfxSeed());
  });
  syncBtn.addEventListener("click", () => {
    syncOnRestart = !syncOnRestart;
    syncBtn.setAttribute("aria-pressed", String(syncOnRestart));
    syncBtn.textContent = syncOnRestart ? "sync: on" : "sync: off";
  });
  muteBtn.addEventListener("click", () => {
    sfx.ensure();
    sfx.setMuted(!sfx.muted);
    muteBtn.setAttribute("aria-pressed", String(sfx.muted));
    muteBtn.textContent = sfx.muted ? "unmute" : "mute";
  });
  $<HTMLInputElement>("#sfx-vol").addEventListener("input", (e) =>
    sfx.setVolume(+(e.target as HTMLInputElement).value),
  );

  player.onRestart = () => {
    if (syncOnRestart && !sfx.muted) sfx.play(family, sfxSeed());
  };
  player.onTick = syncTransport;

  // ---- export

  const expNote = $("#exp-note");
  const expBtns = ["#exp-zip", "#exp-sheet", "#exp-json", "#exp-gif", "#exp-frame", "#exp-wav"].map((s) =>
    $<HTMLButtonElement>(s),
  );
  const gifScale = $<HTMLSelectElement>("#gif-scale");
  let busy = false;

  function note(msg: string, ok = false) {
    expNote.textContent = msg;
    expNote.classList.toggle("export-ok", ok);
  }
  function done(name: string, blob: Blob) {
    download(blob, name);
    note(`✓ ${name} — ${(blob.size / 1024).toFixed(1)} KB downloaded`, true);
  }
  async function guarded(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    for (const b of expBtns) b.disabled = true;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      note(`export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      busy = false;
      for (const b of expBtns) b.disabled = false;
    }
  }

  const sheetJsonText = (r: ReturnType<typeof renderBareFrames>) =>
    JSON.stringify(sheetJson(entry, r, `${base}.png`, style), null, 2);

  expBtns[0].addEventListener("click", () =>
    guarded(async () => {
      const r = renderBareFrames(entry, style);
      note(`packing ${r.n} frames…`);
      const png = new Uint8Array(await (await canvasToBlob(sheetCanvas(r))).arrayBuffer());
      const zip = makeZip([
        { name: `${base}.png`, data: png },
        { name: `${base}.json`, data: new TextEncoder().encode(sheetJsonText(r)) },
      ]);
      done(`${base}.zip`, zip);
    }),
  );
  expBtns[1].addEventListener("click", () =>
    guarded(async () => {
      done(`${base}.png`, await canvasToBlob(sheetCanvas(renderBareFrames(entry, style))));
    }),
  );
  expBtns[2].addEventListener("click", () =>
    guarded(async () => {
      const json = sheetJsonText(renderBareFrames(entry, style));
      done(`${base}.json`, new Blob([json], { type: "application/json" }));
    }),
  );
  expBtns[3].addEventListener("click", () =>
    guarded(async () => {
      const r = renderBareFrames(entry, style);
      done(`${base}.gif`, await buildGif(r, +gifScale.value || 2, (i, n) => note(`encoding GIF ${i}/${n}…`)));
    }),
  );
  expBtns[4].addEventListener("click", () =>
    guarded(async () => {
      const [w, h] = meta.size;
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      cv.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(renderBareFrameAt(entry, style, shownT())), w, h), 0, 0);
      done(`${base}-frame.png`, await canvasToBlob(cv));
    }),
  );
  expBtns[5].addEventListener("click", () =>
    guarded(async () => {
      note("rendering WAV…");
      done(`${base}.wav`, await sfx.renderWav(family, sfxSeed()));
    }),
  );

  // ---- keys: Esc goes back to the catalog (the "/" search lives on the home page's own entry)

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const t = e.target as HTMLElement | null;
    if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    location.href = "/";
  });

  // ---- one clock

  setPlaying(style.playing);
  syncTransport();
  let last = performance.now();
  const loop = (now: number) => {
    player.tick(Math.min(0.1, (now - last) / 1000));
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const entry = findFx(new URLSearchParams(location.search).get("fx"));
if (entry) runEditor(entry);
else fail(new URLSearchParams(location.search).get("fx"));
