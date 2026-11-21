// /feel/boss-hp/ — the boss HP bar recipe page. Static prose lives in the
// HTML; this module builds the per-layer switches and sliders from the shared
// parameter model, mounts the live bar, and regenerates the Godot / web
// snippets whenever anything changes.

import "../style.css";
import "../templates/templates.css";
import "./feel.css";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { syncHeaderOffset } from "../lib/header-offset";
import { el } from "../lib/el";
import {
  BOSS_DEFAULT_PARAMS,
  BOSS_PRESETS,
  BOSS_SLIDERS,
  cloneBossParams,
  type BossHpParams,
  type BossPresetId,
} from "../feel/boss-params";
import { buildBossCodeTabs } from "../feel/boss-codegen";
import type { BossBarDemo } from "../feel/boss-demo";
import { createBossBar } from "../feel/boss-demo";
import { buildShareUrl, parseBossState, readTuneParam, serializeBoss } from "../feel/share";

mountToolsMenu();
mountLangSwitcher();
syncHeaderOffset();

const params: BossHpParams = cloneBossParams(BOSS_DEFAULT_PARAMS);
let demo: BossBarDemo | null = null;

// ---- shared tune from the URL (?tune=) ------------------------------------------

// Parsed before the bar mounts so sliders, demo and code all boot on the shared
// values. A garbage token is ignored silently — the page default stands. The
// reduced-motion preference is local, so it never travels through the URL.
const sharedState = (() => {
  const raw = readTuneParam(location.search);
  return raw ? parseBossState(raw) : null;
})();
if (sharedState) Object.assign(params, sharedState.params);

// ---- layer controls -----------------------------------------------------------

type SliderSpec = { key: keyof typeof BOSS_SLIDERS; path: string; label: string; format?: "int" | "pct" };
type LayerSpec = {
  mount: HTMLElement;
  toggle: string;
  sliders: SliderSpec[];
  subs?: { path: string; label: string }[];
};

const LAYERS: LayerSpec[] = [
  {
    mount: document.querySelector<HTMLElement>('[data-controls="lag"]')!,
    toggle: "lag.on",
    sliders: [
      { key: "wait", path: "lag.wait", label: "boss.pWait" },
      { key: "catch", path: "lag.catch", label: "boss.pCatch" },
    ],
  },
  {
    mount: document.querySelector<HTMLElement>('[data-controls="react"]')!,
    toggle: "react.on",
    sliders: [
      { key: "shakeDecay", path: "react.shakeDecay", label: "boss.pShakeDecay" },
      { key: "shakeMax", path: "react.shakeMax", label: "boss.pShakeMax", format: "int" },
      { key: "flash", path: "react.flash", label: "boss.pFlash" },
    ],
  },
  {
    mount: document.querySelector<HTMLElement>('[data-controls="ticks"]')!,
    toggle: "ticks.on",
    sliders: [{ key: "step", path: "ticks.step", label: "boss.pStep", format: "pct" }],
    subs: [{ path: "ticks.markers", label: "boss.sMarkers" }],
  },
  {
    mount: document.querySelector<HTMLElement>('[data-controls="layers"]')!,
    toggle: "layers.on",
    sliders: [{ key: "count", path: "layers.count", label: "boss.pCount", format: "int" }],
  },
  {
    mount: document.querySelector<HTMLElement>('[data-controls="alarm"]')!,
    toggle: "alarm.on",
    sliders: [
      { key: "threshold", path: "alarm.threshold", label: "boss.pThreshold", format: "pct" },
      { key: "pulseHz", path: "alarm.pulseHz", label: "boss.pHz" },
    ],
    subs: [{ path: "alarm.edge", label: "boss.sEdge" }],
  },
];

const getPath = (obj: unknown, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], obj);
const setPath = (obj: unknown, path: string, value: unknown): void => {
  const parts = path.split(".");
  let node: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) node = (node as Record<string, unknown>)[parts[i]];
  (node as Record<string, unknown>)[parts[parts.length - 1]] = value;
};

function buildControls(): void {
  for (const layer of LAYERS) {
    layer.mount.replaceChildren();
    const on = Boolean(getPath(params, layer.toggle));

    const head = el("label", { className: "feel-switch" }, [
      el("input", { type: "checkbox", checked: on, "data-boss-toggle": layer.toggle.split(".")[0], "aria-label": t("feel.layerOn") }),
      el("span", { className: "feel-switch-track", "aria-hidden": "true" }),
    ]);
    layer.mount.append(head);

    const body = el("div", { className: "feel-layer-sliders" });
    layer.mount.append(body);

    const sync = () => body.classList.toggle("is-off", !Boolean(getPath(params, layer.toggle)));

    head.querySelector("input")!.addEventListener("change", (e) => {
      setPath(params, layer.toggle, (e.target as HTMLInputElement).checked);
      onParamsChanged();
      sync();
    });

    for (const sub of layer.subs ?? []) {
      const row = el("label", { className: "feel-sub" }, [
        el("input", { type: "checkbox", checked: Boolean(getPath(params, sub.path)), "data-boss-sub": sub.path }),
        el("span", { text: t(sub.label) }),
      ]);
      body.append(row);
      row.querySelector("input")!.addEventListener("change", (e) => {
        setPath(params, sub.path, (e.target as HTMLInputElement).checked);
        onParamsChanged();
      });
    }

    for (const spec of layer.sliders) {
      const meta = BOSS_SLIDERS[spec.key];
      const value = Number(getPath(params, spec.path));
      const valueOut = el("output", { text: formatValue(value, spec) });
      const input = el("input", {
        type: "range",
        min: String(meta.min),
        max: String(meta.max),
        step: String(meta.step),
        value: String(value),
        "data-boss-slider": spec.path,
      });
      input.addEventListener("input", () => {
        setPath(params, spec.path, Number(input.value));
        valueOut.textContent = formatValue(Number(input.value), spec);
        onParamsChanged();
      });
      const recBadge = el("span", {
        className: "feel-slider-rec",
        title: t("feel.recTag"),
        text: `${t("feel.recTag")}: ${formatValue(meta.rec, spec)}`,
      });
      body.append(
        el("div", { className: "feel-slider" }, [
          el("div", { className: "feel-slider-top" }, [el("label", { text: t(spec.label) }), valueOut]),
          input,
          recBadge,
        ]),
      );
    }
    sync();
  }

  // reduced-motion selector (demo-wide, not a layer)
  const rmMount = document.querySelector<HTMLElement>('[data-controls="motion"]')!;
  rmMount.replaceChildren(
    el("label", { className: "feel-sub feel-motion-row" }, [
      el("span", { text: t("boss.rmLabel") }),
      el(
        "select",
        { "data-boss-motion": "" },
        (["auto", "on", "off"] as const).map((m) =>
          el("option", { value: m, text: t(m === "auto" ? "boss.rmAuto" : m === "on" ? "boss.rmOn" : "boss.rmOff"), selected: params.reducedMotion === m }),
        ),
      ),
    ]),
  );
  rmMount.querySelector("select")!.addEventListener("change", (e) => {
    params.reducedMotion = (e.target as HTMLSelectElement).value as BossHpParams["reducedMotion"];
    onParamsChanged();
  });
}

function formatValue(v: number, spec: SliderSpec): string {
  if (spec.format === "int") return String(Math.round(v));
  if (spec.format === "pct") return `${Math.round(v)}%`;
  return `${v.toFixed(2).replace(/\.?0+$/, "")}s`;
}

function refreshControlValues(): void {
  for (const layer of LAYERS) {
    const box = layer.mount.querySelector<HTMLInputElement>("[data-boss-toggle]");
    if (box) box.checked = Boolean(getPath(params, layer.toggle));
    layer.mount.querySelectorAll<HTMLInputElement>("[data-boss-sub]").forEach((i) => {
      i.checked = Boolean(getPath(params, i.dataset.bossSub!));
    });
    layer.mount.querySelectorAll<HTMLInputElement>("[data-boss-slider]").forEach((i) => {
      const v = Number(getPath(params, i.dataset.bossSlider!));
      i.value = String(v);
      const spec = layer.sliders.find((s) => s.path === i.dataset.bossSlider);
      const out = i.closest(".feel-slider")?.querySelector("output");
      if (out && spec) out.textContent = formatValue(v, spec);
    });
    layer.mount.querySelector<HTMLElement>(".feel-layer-sliders")?.classList.toggle("is-off", !Boolean(getPath(params, layer.toggle)));
  }
  const sel = document.querySelector<HTMLSelectElement>("[data-boss-motion]");
  if (sel) sel.value = params.reducedMotion;
}

// ---- presets / demo buttons -------------------------------------------------------

const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".boss-preset"));

function applyPreset(id: BossPresetId): void {
  Object.assign(params, cloneBossParams(BOSS_PRESETS[id]));
  refreshControlValues();
  // setParams + code only — manual slider tweaks clear the highlight, preset
  // switches must not (same rule as the hit-feel page).
  pushDemo();
  renderCodebox();
  presetButtons.forEach((b) => {
    const on = b.dataset.preset === id;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  scheduleShareSync();
}

presetButtons.forEach((b) =>
  b.addEventListener("click", () => {
    setCompareUi("mine"); // picking a tune ends any baseline preview
    applyPreset(b.dataset.preset as BossPresetId);
  }),
);

document.querySelector<HTMLButtonElement>(".boss-hit")?.addEventListener("click", () => demo?.damage(12));
document.querySelector<HTMLButtonElement>(".boss-heavy")?.addEventListener("click", () => demo?.damage(30));
document.querySelector<HTMLButtonElement>(".boss-heal")?.addEventListener("click", () => demo?.heal(18));
document.querySelector<HTMLButtonElement>(".boss-reset")?.addEventListener("click", () => demo?.reset());

// ---- baseline compare + shareable link -------------------------------------------

// The bar can play the page default while the sliders keep the user's tune —
// comparing never destroys the dialled-in state. The generated code follows the
// demo side (the panel is labeled with whichever tune it is exporting), so a
// baseline preview never ships numbers that differ from what is on screen.
const baselineParams = (): BossHpParams => cloneBossParams(BOSS_DEFAULT_PARAMS);
let compareMode: "mine" | "base" = "mine";
const compareButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".feel-compare-btn"));
const compareNote = document.querySelector<HTMLElement>(".feel-compare-note");
const exportLabel = document.querySelector<HTMLElement>(".feel-export");

/** What the demo bar (and the generated code) should run right now. */
const activeParams = (): BossHpParams => (compareMode === "base" ? baselineParams() : params);

function pushDemo(): void {
  demo?.setParams(activeParams());
}

function setCompareUi(mode: "mine" | "base"): void {
  compareMode = mode;
  compareButtons.forEach((b) => {
    const on = b.dataset.compare === mode;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  if (compareNote) compareNote.hidden = mode !== "base";
  if (exportLabel) {
    exportLabel.dataset.export = mode;
    const what = exportLabel.querySelector("b");
    if (what) what.textContent = t(mode === "base" ? "feel.exportBase" : "feel.exportMine");
  }
}

compareButtons.forEach((b) =>
  b.addEventListener("click", () => {
    setCompareUi(b.dataset.compare === "base" ? "base" : "mine");
    pushDemo();
    // code follows the demo side: re-render so the export matches what plays
    renderCodebox();
  }),
);

// ?tune= follows every change via replaceState (no history spam); the share
// button flushes it first so the copied URL always carries the current sliders.
let shareTimer = 0;
function syncShareUrl(): void {
  const url = buildShareUrl(location.origin, location.pathname, location.search, location.hash, serializeBoss(params));
  history.replaceState(null, "", url);
}
function scheduleShareSync(): void {
  clearTimeout(shareTimer);
  shareTimer = window.setTimeout(syncShareUrl, 250);
}

const shareBtn = document.querySelector<HTMLButtonElement>(".feel-share");
const shareUrlBox = document.querySelector<HTMLInputElement>(".feel-share-url");
shareBtn?.addEventListener("click", async () => {
  clearTimeout(shareTimer);
  syncShareUrl();
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = t("feel.shareDone");
    setTimeout(() => {
      shareBtn.textContent = t("feel.share");
    }, 1400);
  } catch {
    // clipboard blocked — surface the URL itself so it can be copied by hand
    if (shareUrlBox) {
      shareUrlBox.value = url;
      shareUrlBox.hidden = false;
      shareUrlBox.focus();
      shareUrlBox.select();
    }
  }
});

// ---- engine code panel -----------------------------------------------------------

const codebox = document.querySelector<HTMLElement>("#boss-codebox")!;
let engine: "godot" | "web" = "godot";
let activeFile = "boss_hp_bar.gd";
let currentCode = "";

function renderCodebox(): void {
  // built from activeParams() — the code panel always matches the demo (and its
  // Exporting label), so a baseline preview exports the page default, not a
  // silently different user tune
  const tabs = buildBossCodeTabs(activeParams());
  const mine = tabs.filter((x) => x.engine === engine);
  if (!mine.some((x) => x.id === activeFile)) activeFile = mine[0].id;
  const active = mine.find((x) => x.id === activeFile) ?? mine[0];
  currentCode = active.code;

  codebox.replaceChildren();
  const engines = el("div", { className: "codebox-tabs feel-engine-tabs", role: "tablist" });
  for (const e of ["godot", "web"] as const) {
    engines.append(
      el("button", {
        className: "codebox-tab" + (engine === e ? " on" : ""),
        type: "button",
        role: "tab",
        text: t(e === "godot" ? "feel.godotTab" : "boss.webTab"),
        "aria-selected": String(engine === e),
        onclick: () => {
          engine = e;
          renderCodebox();
        },
      }),
    );
  }
  const files = el("div", { className: "codebox-tabs feel-file-tabs", role: "tablist" });
  for (const tab of mine) {
    files.append(
      el("button", {
        className: "codebox-tab" + (tab.id === activeFile ? " on" : ""),
        type: "button",
        role: "tab",
        text: tab.label,
        "aria-selected": String(tab.id === activeFile),
        onclick: () => {
          activeFile = tab.id;
          renderCodebox();
        },
      }),
    );
  }
  const actions = el("div", { className: "codebox-actions" });
  const copy = el("button", {
    className: "tpl-btn",
    type: "button",
    text: t("tpl.copy"),
    "data-i18n": "tpl.copy",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(currentCode);
        copy.textContent = t("tpl.copied");
        setTimeout(() => {
          copy.textContent = t("tpl.copy");
        }, 1400);
      } catch {
        /* clipboard blocked — the text is still selectable */
      }
    },
  });
  actions.append(copy);
  const pre = el("pre", { className: "codebox-pre feel-code-pre" });
  pre.append(el("code", { text: currentCode }));
  codebox.append(engines, files, actions, pre);
}

// ---- param change fan-out ----------------------------------------------------------

function onParamsChanged(): void {
  // a manual tweak means the user is tuning again — stop previewing the baseline
  setCompareUi("mine");
  pushDemo();
  presetButtons.forEach((b) => {
    b.classList.remove("on");
    b.setAttribute("aria-pressed", "false");
  });
  renderCodebox();
  scheduleShareSync();
}

// ---- demo mount ----------------------------------------------------------------------

const demoHost = document.querySelector<HTMLElement>("#boss-demo")!;
demo = createBossBar(demoHost, params);

// ---- boot -----------------------------------------------------------------------------

buildControls();
if (sharedState?.preset) {
  applyPreset(sharedState.preset);
} else if (sharedState) {
  // a custom tune from a link: no preset owns these numbers — say where they came from
  presetButtons.forEach((b) => {
    b.classList.remove("on");
    b.setAttribute("aria-pressed", "false");
  });
  pushDemo();
  renderCodebox();
  document.querySelector<HTMLElement>(".feel-shared-note")?.removeAttribute("hidden");
} else {
  applyPreset("heavy"); // the page boots on the full default recipe, highlight it
}
applyStaticText(document);
onLocaleChange(() => {
  applyStaticText(document);
  setCompareUi(compareMode); // the static pass resets the Exporting label's text
  buildControls();
  renderCodebox();
  document.title = `${t("feelBoss.h1")} – PixJuice`;
});
document.title = `${t("feelBoss.h1")} – PixJuice`;
