import "./text-fit.css";
import { getLocale, onLocaleChange } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { BOX_FIELDS, CONTROLS, MODES, classifyFit, properties, serializeCss, serializeJson, type Mode, type Setup } from "../text-fit/model";
import { COPY, SAMPLES } from "../text-fit/strings";

mountToolsMenu();

const lab = document.querySelector<HTMLElement>(".text-fit")!;
const editor = lab.querySelector<HTMLTextAreaElement>("#tf-text")!;
const edited = lab.querySelector<HTMLElement>("#tf-edited")!;
const sampleBar = lab.querySelector<HTMLElement>(".tf-samples")!;
const controls = lab.querySelector<HTMLElement>(".tf-controls")!;
const comparison = lab.querySelector<HTMLElement>(".tf-comparison")!;
const probeContainer = lab.querySelector<HTMLElement>(".tf-probes")!;
const modeSelect = lab.querySelector<HTMLSelectElement>("#tf-mode")!;
const snippets = {
  css: lab.querySelector<HTMLPreElement>("#tf-css")!,
  json: lab.querySelector<HTMLPreElement>("#tf-json")!,
};

const initial = SAMPLES.find((sample) => sample.id === getLocale()) ?? SAMPLES[0];
let sampleId: Setup["sampleId"] = initial.id;
let textLang: string = initial.lang;
editor.value = initial.text;
editor.lang = textLang;

const samples = SAMPLES.map((sample) => {
  const button = document.createElement("button");
  button.className = "btn";
  button.type = "button";
  sampleBar.append(button);
  button.addEventListener("click", () => {
    editor.value = sample.text;
    sampleId = sample.id;
    textLang = sample.lang;
    editor.lang = textLang;
    render();
  });
  return { sample, button };
});

const sliders = BOX_FIELDS.map((field) => {
  const settings = CONTROLS[field];
  const id = `tf-${field}`;
  const row = document.createElement("div");
  row.innerHTML = `<label for="${id}"><span data-copy="${field}"></span><output for="${id}" aria-live="off"></output></label>
    <input id="${id}" type="range" min="${settings.min}" max="${settings.max}" step="${settings.step}" value="${settings.initial}">`;
  controls.append(row);
  const input = row.querySelector("input")!;
  input.addEventListener("input", render);
  return { field, input, output: row.querySelector("output")! };
});

const cards = MODES.map((mode) => {
  const card = document.createElement("article");
  card.className = "tf-panel";
  card.innerHTML = `<h3 id="tf-card-${mode}"></h3>
    <div class="tf-stage" role="region" aria-labelledby="tf-card-${mode}" tabindex="0"><div class="tf-preview" dir="auto"></div></div>
    <p class="tf-readout"></p>`;
  comparison.append(card);

  // An auto-height copy reveals multiple lines even when the visible box is taller.
  const probe = document.createElement("div");
  probe.dir = "auto";
  probeContainer.append(probe);
  const option = new Option("", mode);
  modeSelect.add(option);
  return {
    mode, probe, option, title: card.querySelector("h3")!,
    preview: card.querySelector<HTMLElement>(".tf-preview")!,
    readout: card.querySelector<HTMLElement>(".tf-readout")!,
  };
});

const copyStatuses = lab.querySelectorAll<HTMLElement>(".tf-copy-status");
function render(): void {
  const copy = COPY[getLocale()];
  const size = Object.fromEntries(sliders.map(({ field, input, output }) => {
    const value = input.valueAsNumber;
    const formatted = new Intl.NumberFormat(getLocale()).format(value);
    output.value = field === "lineHeight" ? formatted : `${formatted} px`;
    return [field, value];
  })) as Pick<Setup, (typeof BOX_FIELDS)[number]>;
  const setup: Setup = {
    ...size, text: editor.value, mode: modeSelect.value as Mode, sampleId, lang: textLang,
  };
  for (const { sample, button } of samples) {
    button.setAttribute("aria-pressed", String(sample.id === sampleId));
  }
  edited.hidden = sampleId !== null;

  for (const { mode, preview, probe } of cards) {
    const css = properties(setup, mode);
    for (const target of [preview, probe]) {
      for (const [name, value] of Object.entries(css)) target.style.setProperty(name, value);
      target.textContent = setup.text;
      target.lang = setup.lang;
    }
    probe.style.height = "auto";
    probe.style.overflow = "visible";
  }
  for (const { mode, preview, probe, readout } of cards) {
    const probeHeight = probe.getBoundingClientRect().height;
    const result = classifyFit(mode, {
      clientHeight: preview.clientHeight,
      clientWidth: preview.clientWidth,
      scrollHeight: Math.max(preview.scrollHeight, Math.round(probeHeight)),
      scrollWidth: Math.max(preview.scrollWidth, probe.scrollWidth),
      wraps: probeHeight > 1.5 * setup.fontSize * setup.lineHeight,
    });
    const axes = [result.x ? copy.x : "", result.y ? copy.y : ""].filter(Boolean);
    const axisLabel = axes.length ? ` (${axes.join(" / ")})` : "";
    readout.dataset.outcome = result.outcome;
    readout.textContent = [copy[result.outcome] + axisLabel, result.wraps ? copy.wraps : ""]
      .filter(Boolean).join(" · ");
  }

  snippets.css.textContent = serializeCss(setup);
  snippets.json.textContent = serializeJson(setup);
  for (const status of copyStatuses) status.textContent = "";
}

function localize(): void {
  const locale = getLocale();
  const copy = COPY[locale];
  document.documentElement.lang = locale;
  document.title = `${copy.title} — PixJuice`;
  for (const element of lab.querySelectorAll<HTMLElement>("[data-copy]")) {
    element.textContent = copy[element.dataset.copy as Exclude<keyof typeof copy, "modes">];
  }
  for (const { sample, button } of samples) {
    button.textContent = "label" in sample ? sample.label : copy.compound;
    button.lang = "label" in sample ? sample.lang : locale;
  }
  for (const { mode, title, option } of cards) {
    title.textContent = copy.modes[mode];
    option.textContent = copy.modes[mode];
  }
  render();
}

editor.addEventListener("input", () => {
  sampleId = null;
  render();
});
modeSelect.addEventListener("change", render);

for (const button of lab.querySelectorAll<HTMLButtonElement>("[data-format]")) {
  const format = button.dataset.format as keyof typeof snippets;
  const status = button.parentElement!.querySelector<HTMLElement>(".tf-copy-status")!;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(snippets[format].textContent!);
      status.textContent = COPY[getLocale()].copied;
    } catch {
      status.textContent = COPY[getLocale()].copyFailed;
    }
  });
}

onLocaleChange(localize);
localize();
