// /feel/hit/ — the hit-feel recipe page. Static prose lives in the HTML; this
// module builds the per-layer switches and sliders from the shared parameter
// model, mounts the 3D arena lazily, and regenerates the Godot/Unity snippets
// whenever anything changes.

import "../style.css";
import "../templates/templates.css";
import "./feel.css";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { el } from "../lib/el";
import {
  cloneParams,
  DEFAULT_PARAMS,
  PRESETS,
  SLIDERS,
  type FeelParams,
  type HitZone,
  type PresetId,
} from "../feel/params";
import { buildCodeTabs } from "../feel/codegen";
import type { FeelDemo } from "../feel/demo";
import { ImpactAudio } from "../feel/sfx";

mountToolsMenu();
mountLangSwitcher();

const params: FeelParams = DEFAULT_PARAMS;
let zone: HitZone = "chest";
let demo: FeelDemo | null = null;
const audio = new ImpactAudio();

// ---- layer controls -----------------------------------------------------------

type SliderSpec = { key: keyof typeof SLIDERS; path: string; label: string };
type LayerSpec = {
  mount: HTMLElement;
  toggle: string; // top-level switch, e.g. "hitStop"
  sliders: SliderSpec[];
  subs?: { path: string; label: string }[]; // sub-switches (flash, bands…)
};

const LAYERS: LayerSpec[] = [
  {
    mount: document.querySelector<HTMLElement>('[data-controls="hitStop"]')!,
    toggle: "hitStop.on",
    sliders: [{ key: "frames", path: "hitStop.frames", label: "feel.pFrames" }],
  },
  {
    mount: document.querySelector<HTMLElement>('[data-controls="shake"]')!,
    toggle: "shake.on",
    sliders: [
      { key: "trauma", path: "shake.trauma", label: "feel.pTrauma" },
      { key: "decay", path: "shake.decay", label: "feel.pDecay" },
    ],
  },
  {
    mount: document.querySelector<HTMLElement>('[data-controls="feedback"]')!,
    toggle: "feedback.on",
    sliders: [
      { key: "flashIntensity", path: "feedback.flashIntensity", label: "feel.pFlash" },
      { key: "squashAmount", path: "feedback.squashAmount", label: "feel.pSquash" },
      { key: "numberScale", path: "feedback.numberScale", label: "feel.pDigits" },
    ],
    subs: [
      { path: "feedback.flash", label: "feel.sFlash" },
      { path: "feedback.squash", label: "feel.sSquash" },
      { path: "feedback.numbers", label: "feel.sNumbers" },
    ],
  },
  {
    mount: document.querySelector<HTMLElement>('[data-controls="knockback"]')!,
    toggle: "knockback.on",
    sliders: [
      { key: "distance", path: "knockback.distance", label: "feel.pDistance" },
      { key: "stopTime", path: "knockback.stopTime", label: "feel.pStop" },
    ],
  },
  {
    mount: document.querySelector<HTMLElement>('[data-controls="vfx"]')!,
    toggle: "vfx.on",
    sliders: [{ key: "sparks", path: "vfx.sparks", label: "feel.pSparks" }],
    subs: [{ path: "vfx.shockwave", label: "feel.pShockwave" }],
  },
  {
    mount: document.querySelector<HTMLElement>('[data-controls="sfx"]')!,
    toggle: "sfx.on",
    sliders: [{ key: "volume", path: "sfx.volume", label: "feel.pVolume" }],
    subs: [
      { path: "sfx.low", label: "feel.bLow" },
      { path: "sfx.mid", label: "feel.bMid" },
      { path: "sfx.high", label: "feel.bHigh" },
    ],
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
      el("input", { type: "checkbox", checked: on, "data-feel-toggle": layer.toggle.split(".")[0], "aria-label": t("feel.layerOn") }),
      el("span", { className: "feel-switch-track", "aria-hidden": "true" }),
    ]);
    layer.mount.append(head);

    const body = el("div", { className: "feel-layer-sliders" });
    layer.mount.append(body);

    const sync = () => {
      const active = Boolean(getPath(params, layer.toggle));
      body.classList.toggle("is-off", !active);
      head.querySelector("input")!.disabled = false;
    };

    head.querySelector("input")!.addEventListener("change", (e) => {
      setPath(params, layer.toggle, (e.target as HTMLInputElement).checked);
      onParamsChanged();
      sync();
    });

    for (const sub of layer.subs ?? []) {
      const row = el("label", { className: "feel-sub" }, [
        el("input", { type: "checkbox", checked: Boolean(getPath(params, sub.path)), "data-feel-sub": sub.path }),
        el("span", { text: t(sub.label) }),
      ]);
      body.append(row);
      row.querySelector("input")!.addEventListener("change", (e) => {
        setPath(params, sub.path, (e.target as HTMLInputElement).checked);
        onParamsChanged();
      });
    }

    for (const spec of layer.sliders) {
      const meta = SLIDERS[spec.key];
      const value = Number(getPath(params, spec.path));
      const valueOut = el("output", { text: formatValue(value, spec.key) });
      const input = el("input", {
        type: "range",
        min: String(meta.min),
        max: String(meta.max),
        step: String(meta.step),
        value: String(value),
        "data-feel-slider": spec.path,
      });
      input.addEventListener("input", () => {
        setPath(params, spec.path, Number(input.value));
        valueOut.textContent = formatValue(Number(input.value), spec.key);
        onParamsChanged();
      });
      const recBadge = el("span", {
        className: "feel-slider-rec",
        title: t("feel.recTag"),
        text: `${t("feel.recTag")}: ${formatValue(meta.rec, spec.key)}`,
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
}

function formatValue(v: number, key: keyof typeof SLIDERS): string {
  if (key === "frames") return String(Math.round(v));
  if (key === "sparks") return String(Math.round(v));
  return v.toFixed(2).replace(/\.?0+$/, "");
}

function refreshControlValues(): void {
  for (const layer of LAYERS) {
    const box = layer.mount.querySelector<HTMLInputElement>('[data-feel-toggle]');
    if (box) box.checked = Boolean(getPath(params, layer.toggle));
    layer.mount.querySelectorAll<HTMLInputElement>("[data-feel-sub]").forEach((i) => {
      i.checked = Boolean(getPath(params, i.dataset.feelSub!));
    });
    layer.mount.querySelectorAll<HTMLInputElement>("[data-feel-slider]").forEach((i) => {
      i.value = String(getPath(params, i.dataset.feelSlider!));
    });
    layer.mount.querySelector<HTMLElement>(".feel-layer-sliders")?.classList.toggle(
      "is-off",
      !Boolean(getPath(params, layer.toggle)),
    );
  }
}

// ---- presets / zone / attack ----------------------------------------------------

const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".feel-preset"));
const zoneButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".feel-zone-btn"));

function applyPreset(id: PresetId): void {
  Object.assign(params, cloneParams(PRESETS[id]));
  refreshControlValues();
  presetButtons.forEach((b) => {
    const on = b.dataset.preset === id;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  onParamsChanged();
  if (demo) demo.attack();
}

presetButtons.forEach((b) =>
  b.addEventListener("click", () => {
    audio.resume();
    applyPreset(b.dataset.preset as PresetId);
  }),
);

function setZone(z: HitZone): void {
  zone = z;
  zoneButtons.forEach((b) => {
    const on = b.dataset.zone === z;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  demo?.setZone(z);
}
zoneButtons.forEach((b) => b.addEventListener("click", () => setZone(b.dataset.zone as HitZone)));

document.querySelector<HTMLButtonElement>(".feel-attack")?.addEventListener("click", () => {
  audio.resume();
  demo?.attack();
});

// ---- engine code panel -----------------------------------------------------------

const codebox = document.querySelector<HTMLElement>("#feel-codebox")!;
let engine: "godot" | "unity" = "godot";
let activeFile = "hit_feel.gd";
let currentCode = "";

function renderCodebox(): void {
  const tabs = buildCodeTabs(params);
  const mine = tabs.filter((x) => x.engine === engine);
  if (!mine.some((x) => x.id === activeFile)) activeFile = mine[0].id;
  const active = mine.find((x) => x.id === activeFile) ?? mine[0];
  currentCode = active.code;

  codebox.replaceChildren();
  const engines = el("div", { className: "codebox-tabs feel-engine-tabs", role: "tablist" });
  for (const e of ["godot", "unity"] as const) {
    engines.append(
      el("button", {
        className: "codebox-tab" + (engine === e ? " on" : ""),
        type: "button",
        role: "tab",
        text: t(e === "godot" ? "feel.godotTab" : "feel.unityTab"),
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
  demo?.setParams(params);
  presetButtons.forEach((b) => {
    b.classList.remove("on");
    b.setAttribute("aria-pressed", "false");
  });
  renderCodebox();
}

// ---- demo mount ----------------------------------------------------------------------

const demoHost = document.querySelector<HTMLElement>("#feel-demo")!;
const status = demoHost.querySelector<HTMLElement>(".feel-status");

void import("../feel/demo")
  .then(({ createFeelDemo }) => createFeelDemo(demoHost, params))
  .then((d) => {
    demo = d;
    d.setZone(zone);
    d.onZonePick((z) => setZone(z));
    d.onImpact(() => audio.play(params));
    status?.remove();
  })
  .catch(() => {
    if (status) {
      status.textContent = t("feel.demoErr");
      status.classList.add("feel-error");
    }
  });

// ---- boot -----------------------------------------------------------------------------

buildControls();
renderCodebox();
setZone("chest");
applyStaticText(document);
onLocaleChange(() => {
  applyStaticText(document);
  buildControls();
  renderCodebox();
  document.title = `${t("feelHit.h1")} – PixJuice`;
});
document.title = `${t("feelHit.h1")} – PixJuice`;