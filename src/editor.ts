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
import { familyForCategory, sfx, type SfxDials, type SfxFamily } from "./lib/sfx";
import { applyStaticText, fxDesc, fxName, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";

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

// The pixelfx sources, verbatim: bundled at build time as lazy ?raw chunks keyed by their
// node_modules path ("exhaustive" lifts glob's default node_modules ignore), fetched on demand.
const fxSources = import.meta.glob("/node_modules/pixelfx/src/fx/**/*.js", {
  query: "?raw",
  import: "default",
  exhaustive: true,
});

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
  $("#ed-error-msg").textContent = id ? t("ed.errNamed", { id }) : t("ed.errNone");
  $("#ed-crumb").textContent = t("ed.crumb404");
  document.title = t("title.editor404");
}

function runEditor(entry: CatalogEntry): void {
  const meta = entry.meta;
  const base = exportBase(entry);
  const family: SfxFamily = familyForCategory(entry.cat);
  const wide = isScreen(meta);
  const ASPECT = wide ? 16 / 9 : 6 / 5;
  const PAD = wide ? 1 : 1.25;

  document.title = t("title.fx", { name: fxName(entry) });
  $("#ed-crumb").textContent = t("ed.crumbFx", { name: fxName(entry) });

  // ---- meta strip (kept compact so the pinned stage never outgrows the viewport)

  const desc = $<HTMLParagraphElement>("#fx-desc");
  desc.textContent = fxDesc(entry);
  desc.hidden = !meta.desc;

  function renderFacts(): void {
    const facts: [string, string][] = [
      [t("ed.fSize"), `${meta.size[0]} × ${meta.size[1]}`],
      [t("ed.fFps"), String(meta.fps ?? 30)],
      [t("ed.fLen"), meta.loop ? t("ed.fLenLoop", { n: meta.duration.toFixed(2) }) : `${meta.duration.toFixed(2)}s`],
      [t("ed.fFrames"), String(frameCount(meta))],
    ];
    if (entry.mod.act) facts.push([t("ed.fAct"), actFacts(entry.mod, meta, t)]);
    $("#fx-facts").replaceChildren(
      ...facts.map(([k, v]) => el("div", {}, [el("dt", { textContent: k }), el("dd", { textContent: v })])),
    );
  }
  renderFacts();

  const tags = $("#fx-tags");
  tags.replaceChildren(...(meta.tags ?? []).map((tag) => el("span", { textContent: tag })));
  tags.hidden = !meta.tags?.length;

  // "more" only when the two-line clamp actually trims the description
  const more = $<HTMLButtonElement>("#fx-more");
  requestAnimationFrame(() => {
    if (!desc.hidden) more.hidden = desc.scrollHeight <= desc.clientHeight + 1;
  });
  more.addEventListener("click", () => {
    const open = desc.classList.toggle("open");
    more.textContent = open ? t("ed.less") : t("ed.more");
    more.setAttribute("aria-expanded", String(open));
  });

  // ---- stage

  const style = defaultStyle(entry);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) style.playing = false;
  const stage = $<HTMLCanvasElement>("#stage");
  const stagewrap = $(".stagewrap");
  const player = new Player(stage, entry, ASPECT, PAD, style);
  if (reduced) player.seek(meta.duration * 0.4);

  // The desktop shell pins the preview by giving the tool exactly one viewport; the stage
  // then sizes itself to its box at a whole-pixel scale (editor.ts never stretches it to
  // the column). Phone keeps the CSS letterbox (object-fit) instead of inline sizes.
  document.documentElement.style.setProperty("--ed-head", `${$(".head").offsetHeight}px`);
  const desktop = matchMedia("(min-width: 941px)");
  function fitStage(): void {
    // the pane owns all scrolling on desktop — the page (and its footer) can't intrude
    document.body.classList.toggle("ed-fixed", desktop.matches);
    if (!desktop.matches) {
      stage.style.width = stage.style.height = stage.style.imageRendering = "";
      return;
    }
    player.fitToBox(stagewrap.clientWidth, stagewrap.clientHeight);
  }
  fitStage();
  addEventListener("resize", fitStage);

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
    playBtn.textContent = p ? t("ed.pause") : t("ed.play");
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

  // options carry refs so a language switch can relabel them without losing the selection
  const defOpt = el("option", { value: "" });
  const presetOpts = PRESETS.map((p) => ({ p, opt: el("option", { value: p.value }) }));
  const customOpt = el("option", { value: "custom" });
  function relabelPal(): void {
    defOpt.textContent = t("ed.palDefault", { name: fxName(entry) });
    customOpt.textContent = t("ed.palCustom");
    for (const { p, opt } of presetOpts) opt.textContent = t(`pal.${p.label}`);
  }
  relabelPal();
  pal.append(defOpt, ...presetOpts.map(({ opt }) => opt), customOpt);

  function currentRamp(): string[] | null {
    return style.palette ?? defaultPalette(entry);
  }
  function paintSwatches() {
    const ramp = currentRamp() ?? [];
    // same stop count: refresh in place so an open color picker isn't yanked mid-edit
    if (swatches.children.length === ramp.length) {
      [...swatches.children].forEach((node, i) => {
        const lab = node as HTMLLabelElement;
        lab.style.background = ramp[i];
        lab.title = t("ed.stopTitle", { i: i + 1, color: ramp[i] });
        const inp = lab.firstElementChild as HTMLInputElement;
        inp.value = ramp[i];
        inp.setAttribute("aria-label", t("ed.stopAria", { i: i + 1 }));
      });
      return;
    }
    swatches.replaceChildren(
      ...ramp.map((c, i) => {
        // the input is invisible but fills the swatch, so clicking it opens the native picker
        const inp = el("input", { type: "color", value: c, ariaLabel: t("ed.stopAria", { i: i + 1 }) });
        inp.addEventListener("input", () => {
          const next = [...(currentRamp() ?? [])];
          next[i] = inp.value;
          pal.value = "custom";
          applyPalette(next);
        });
        const lab = el("label", { className: "swatch", title: t("ed.stopTitle", { i: i + 1, color: c }) }, [inp]);
        lab.style.background = c;
        return lab;
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
  const bgBtns: HTMLButtonElement[] = [];
  for (const kind of BG_KINDS) {
    const b = el("button", { className: "btn", type: "button", textContent: t(`bg.${kind}`) });
    b.addEventListener("click", () => {
      player.setBg(kind);
      syncBg();
    });
    bgs.append(b);
    bgBtns.push(b);
  }
  function relabelBgs(): void {
    BG_KINDS.forEach((kind, i) => (bgBtns[i].textContent = t(`bg.${kind}`)));
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
    actorBtn.textContent = style.actor ? t("ed.shown") : t("ed.hidden");
  }
  actorBtn.addEventListener("click", () => {
    style.actor = !style.actor;
    syncActor();
    player.layout(ASPECT, PAD); // acting vs. lone fx changes the stage geometry
    fitStage(); // …and the new bitmap needs to re-fit the box at a whole-pixel scale
  });
  syncActor();

  const replayRow = $("#replay-row");
  const replayBtn = $<HTMLButtonElement>("#replay");
  if (meta.loop) replayRow.hidden = true; // loops don't need auto-replay
  replayBtn.textContent = style.replay ? t("ed.autoOn") : t("ed.off");
  replayBtn.addEventListener("click", () => {
    style.replay = !style.replay;
    replayBtn.setAttribute("aria-pressed", String(style.replay));
    replayBtn.textContent = style.replay ? t("ed.autoOn") : t("ed.off");
  });

  const speed = el("input", { type: "range", min: "0.25", max: "3", step: "0.25", value: "1" });
  const speedVal = el("span", { className: "val", textContent: "1.00×" });
  const speedLabel = el("label", { textContent: t("ed.speed") });
  speed.addEventListener("input", () => {
    style.speed = +speed.value;
    speedVal.textContent = `${(+speed.value).toFixed(2)}×`;
  });
  $("#look-panel").append(
    el("div", { className: "row" }, [
      speedLabel,
      speed,
      speedVal,
    ]),
  );

  // ---- sound

  function famText(): string {
    return `${t(`fam.${family}`)} · ${family}`;
  }
  $("#sfx-family").textContent = famText();
  let syncOnRestart = true;
  const syncBtn = $<HTMLButtonElement>("#sfx-sync");
  const muteBtn = $<HTMLButtonElement>("#sfx-mute");
  function syncSfxBtns(): void {
    syncBtn.textContent = syncOnRestart ? t("ed.syncOn") : t("ed.syncOff");
    muteBtn.textContent = sfx.muted ? t("ed.unmute") : t("ed.mute");
  }
  syncSfxBtns();
  $<HTMLButtonElement>("#sfx-play").addEventListener("click", () => {
    sfx.ensure();
    sfx.play(family, sfxSeed());
  });
  // mutate: reroll a fresh variation of the family preset; it sticks (sync + WAV included)
  $<HTMLButtonElement>("#sfx-mutate").addEventListener("click", () => {
    sfx.ensure();
    sfx.setVariantSeed(Math.floor(Math.random() * 0x7fffffff));
    sfx.play(family, sfxSeed());
  });
  const sfxDials: [HTMLInputElement, HTMLElement, keyof SfxDials, (v: number) => string][] = [
    [$<HTMLInputElement>("#sfx-pitch"), $("#sfx-pitch-val"), "pitch", (v) => `${v.toFixed(2)}×`],
    [$<HTMLInputElement>("#sfx-length"), $("#sfx-length-val"), "length", (v) => `${v.toFixed(2)}×`],
    [$<HTMLInputElement>("#sfx-punch"), $("#sfx-punch-val"), "punch", (v) => `${Math.round(v * 100)}%`],
  ];
  for (const [inp, val, key, fmt] of sfxDials)
    inp.addEventListener("input", () => {
      sfx.setDial(key, +inp.value);
      val.textContent = fmt(+inp.value);
    });
  syncBtn.addEventListener("click", () => {
    syncOnRestart = !syncOnRestart;
    syncBtn.setAttribute("aria-pressed", String(syncOnRestart));
    syncBtn.textContent = syncOnRestart ? t("ed.syncOn") : t("ed.syncOff");
  });
  muteBtn.addEventListener("click", () => {
    sfx.ensure();
    sfx.setMuted(!sfx.muted);
    muteBtn.setAttribute("aria-pressed", String(sfx.muted));
    muteBtn.textContent = sfx.muted ? t("ed.unmute") : t("ed.mute");
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
  const expBtns = [
    "#exp-zip",
    "#exp-sheet",
    "#exp-json",
    "#exp-gif",
    "#exp-frame",
    "#exp-src",
    "#copy-src",
    "#copy-prompt",
  ].map((s) => $<HTMLButtonElement>(s));
  // the WAV download lives in the Sound panel, but is guarded (disabled) like an export too
  const sfxWavBtn = $<HTMLButtonElement>("#sfx-wav");
  const gifScale = $<HTMLSelectElement>("#gif-scale");
  let busy = false;

  function note(msg: string, ok = false) {
    expNote.textContent = msg;
    expNote.classList.toggle("export-ok", ok);
  }
  function done(name: string, blob: Blob) {
    download(blob, name);
    note(t("ed.noteDone", { name, kb: (blob.size / 1024).toFixed(1) }), true);
  }
  async function guarded(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    for (const b of [...expBtns, sfxWavBtn]) b.disabled = true;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      note(t("ed.noteFail", { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      busy = false;
      for (const b of [...expBtns, sfxWavBtn]) b.disabled = false;
    }
  }

  const sheetJsonText = (r: ReturnType<typeof renderBareFrames>) =>
    JSON.stringify(sheetJson(entry, r, `${base}.png`, style), null, 2);

  expBtns[0].addEventListener("click", () =>
    guarded(async () => {
      const r = renderBareFrames(entry, style);
      note(t("ed.notePacking", { n: r.n }));
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
      done(`${base}.gif`, await buildGif(r, +gifScale.value || 2, (i, n) => note(t("ed.noteGif", { i, n }))));
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

  // the Sound panel's WAV download: the same generation path, with the current dials applied
  sfxWavBtn.addEventListener("click", () =>
    guarded(async () => {
      note(t("ed.noteWav"));
      done(`${base}.wav`, await sfx.renderWav(family, sfxSeed()));
    }),
  );

  // ---- source + prompt export: the effect's own pixelfx module, credited and never rewritten

  const flipWord = () =>
    style.flipH && style.flipV ? "both (H+V)" : style.flipH ? "horizontal" : style.flipV ? "vertical" : "none";

  /** Header comment recording the dials at export time + the upstream MIT credit. */
  function settingsHeader(): string {
    const ramp = style.palette ?? defaultPalette(entry);
    return [
      `PixJuice export — ${meta.name} (${entry.id})`,
      `Module source: pixelfx by Patch & Hugo Duprez, MIT — https://github.com/patch-gg/pixelfx`,
      `Dials in PixJuice when exported:`,
      `  palette: ${ramp ? ramp.join(" ") : "default"}`,
      `  seed: ${style.seed ?? "default"}`,
      `  flip: ${flipWord()}`,
      `  angle: ${style.angle}°`,
    ]
      .map((l) => `// ${l}`)
      .join("\n");
  }

  /** The verbatim module text from the bundled pixelfx package — or an honest error. */
  async function loadFxSource(): Promise<string> {
    const load = fxSources[`/node_modules/pixelfx/src/fx/${entry.id}.js`];
    if (!load) throw new Error(`couldn't fetch the pixelfx source for “${entry.id}” (not bundled)`);
    const src = (await load()) as string;
    if (!src.trim()) throw new Error(`the pixelfx source for “${entry.id}” came back empty`);
    return src;
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = el("textarea", { value: text }); // fallback for non-secure contexts
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) throw new Error("the browser blocked the clipboard copy");
    }
  }

  /** A prompt carrying name, description, tags, format and the current dials, ready for any model. */
  function buildPrompt(): string {
    const ramp = style.palette ?? defaultPalette(entry);
    return [
      "Recreate (or vary) this pixel-art game VFX as a sprite sheet.",
      "",
      `Effect: ${meta.name} (${entry.id})`,
      ...(meta.desc ? [`Description: ${meta.desc}`] : []),
      ...(meta.tags?.length ? [`Tags: ${meta.tags.join(", ")}`] : []),
      `Format: ${meta.size[0]}×${meta.size[1]} px, ${meta.fps ?? 30} fps, ${meta.duration.toFixed(2)}s, ${
        meta.loop ? "looping" : "one-shot"
      }, ${frameCount(meta)} frames`,
      "",
      "Current look (dialed in PixJuice):",
      `- palette: ${ramp ? ramp.join(" ") : "the effect's own default ramp"}`,
      `- seed: ${style.seed ?? "default (the effect's own variation)"}`,
      `- flip: ${flipWord()}`,
      `- angle: ${style.angle}°`,
      "",
      "Render it as crisp pixel art with hard edges and a limited palette on transparency. To vary it: keep the motion and silhouette, but shift the palette, reroll the seed for a new variation, or mirror/rotate it.",
    ].join("\n");
  }

  expBtns[5].addEventListener("click", () =>
    guarded(async () => {
      note(t("ed.noteSrc"));
      const file = `${settingsHeader()}\n\n${await loadFxSource()}\n`;
      done(`${base}.js`, new Blob([file], { type: "text/javascript" }));
    }),
  );
  expBtns[6].addEventListener("click", () =>
    guarded(async () => {
      note(t("ed.noteSrc"));
      const file = `${settingsHeader()}\n\n${await loadFxSource()}\n`;
      await copyText(file);
      note(t("ed.noteCopied", { name: `${base}.js`, kb: (file.length / 1024).toFixed(1) }), true);
    }),
  );
  expBtns[7].addEventListener("click", () =>
    guarded(async () => {
      await copyText(buildPrompt());
      note(t("ed.notePrompt"), true);
    }),
  );

  // ---- keys: Esc goes back to the catalog (the "/" search lives on the home page's own entry)

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const t = e.target as HTMLElement | null;
    if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    location.href = "/";
  });

  // ---- i18n: relabel every dynamic control in place (the static chrome is data-i18n)

  onLocaleChange(() => {
    document.title = t("title.fx", { name: fxName(entry) });
    $("#ed-crumb").textContent = t("ed.crumbFx", { name: fxName(entry) });
    desc.textContent = fxDesc(entry);
    renderFacts();
    more.textContent = desc.classList.contains("open") ? t("ed.less") : t("ed.more");
    setPlaying(style.playing);
    relabelPal();
    paintSwatches();
    relabelBgs();
    syncActor();
    replayBtn.textContent = style.replay ? t("ed.autoOn") : t("ed.off");
    speedLabel.textContent = t("ed.speed");
    $("#sfx-family").textContent = famText();
    syncSfxBtns();
    note(t("ed.expNote"));
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

applyStaticText();
mountLangSwitcher();
const fxId = new URLSearchParams(location.search).get("fx");
const entry = findFx(fxId);
if (entry) runEditor(entry);
else {
  fail(fxId);
  onLocaleChange(() => fail(fxId)); // keeps the 404 strings in the active language
}
