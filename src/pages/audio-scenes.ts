import "../style.css";
import "./audio-scenes.css";
import { syncHeaderOffset } from "../lib/header-offset";
import { getLocale, onLocaleChange } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { clipMetadata, clipsForFilter, type Catalog, type Clip } from "../lib/audio-scenes/catalog";
import { createPlayer, type PlaybackState } from "../lib/audio-scenes/player";
import { BRAND, CC0, CREDIT_SITE, STRINGS, clipName } from "../lib/audio-scenes/strings";

mountToolsMenu();
syncHeaderOffset();

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", content = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

function link(url: string, content = "", className = "") {
  const node = element("a", className, content);
  node.href = url;
  return node;
}

function button(className = "") {
  const node = element("button", className);
  node.type = "button";
  return node;
}

const title = document.getElementById("audio-title")!;
const lede = document.getElementById("audio-lede")!;
const filters = document.getElementById("audio-filters")!;
const results = document.getElementById("audio-results")!;
const library = document.getElementById("audio-library")!;
const footer = document.getElementById("audio-footer")!;
const retry = button("btn");
results.after(retry);
retry.hidden = true;

const copy = () => STRINGS[getLocale()];
const localize: (() => void)[] = [];
const cards = new Map<string, (state: PlaybackState) => void>();
const player = createPlayer(() => new Audio(), (id, state) => cards.get(id)?.(state));

let catalog: Catalog | undefined;
let selected = "all";
let catalogError = false;
const sections = new Map<string, HTMLElement>();
const filterButtons = new Map<string, HTMLButtonElement>();

function updateFilter() {
  if (!catalog) {
    results.textContent = catalogError ? copy().catalogError : copy().loadingCatalog;
    return;
  }
  const matches = clipsForFilter(catalog, selected);
  results.textContent = copy().results(matches.length);
  for (const [id, node] of filterButtons) {
    node.setAttribute("aria-pressed", String(id === selected));
  }
  for (const [id, section] of sections) {
    section.hidden = selected !== "all" && id !== selected;
  }
}

function makeCard(clip: Clip) {
  const { id, eventTags } = clipMetadata(clip);
  const card = element("li", "audio-card");
  const heading = element("h3");
  heading.id = id;
  const filename = element("code", "audio-filename", clip.original_filename);
  const duration = element("span");
  const byline = element("p", "audio-byline");
  byline.append(clip.author, " · ", duration);
  const source = link(clip.original_resource_url, clip.original_pack_title);
  const license = element("p", "audio-license");
  const licenseText = element("span");
  license.append(link(clip.license_page_path, CC0), licenseText);
  const play = button("btn audio-play");
  const download = link(clip.download_path, "", "btn audio-download");
  download.download = clip.original_filename;
  const actions = element("div", "audio-actions");
  actions.append(play, download);
  const status = element("p", "audio-status");
  status.setAttribute("role", "status");
  const note = element("p", "audio-note");
  const details = element("details", "audio-details");
  const summary = element("summary");
  const idLabel = element("dt");
  const tagsLabel = element("dt");
  const idValue = element("dd");
  idValue.append(element("code", "", id));
  const tagsValue = element("dd");
  for (const tag of eventTags) tagsValue.append(element("code", "", tag));
  const data = element("dl");
  data.append(idLabel, idValue, tagsLabel, tagsValue);
  const packLicense = link(clip.pack_license_path);
  details.append(summary, data, packLicense);
  card.append(heading, filename, byline, source, license, actions, status);
  if (clip.mapping_notes) card.append(note);
  card.append(details);

  let state: PlaybackState = "idle";
  function updatePlayback(next: PlaybackState) {
    state = next;
    const text = copy();
    play.textContent = state === "loading" || state === "playing" ? text.stop : text.play;
    status.textContent = state === "idle" ? "" : text[state];
    card.dataset.state = state;
    play.setAttribute("aria-label", `${play.textContent} · ${heading.textContent}`);
  }

  cards.set(id, updatePlayback);
  play.addEventListener("click", () => {
    if (player.activeId === id) player.stop();
    else void player.play(clip);
  });
  localize.push(() => {
    const text = copy();
    heading.textContent = clipName(getLocale(), clip);
    duration.textContent = new Intl.NumberFormat(getLocale(), {
      style: "unit", unit: "second", maximumFractionDigits: 2,
    }).format(clip.duration_sec);
    const terms = [clip.commercial_use ? text.commercial : "", clip.attribution_required ? "" : text.attribution];
    licenseText.textContent = terms.filter(Boolean).map(term => ` · ${term}`).join("");
    download.textContent = text.download;
    summary.textContent = text.details;
    summary.setAttribute("aria-label", `${text.details} · ${heading.textContent}`);
    download.setAttribute("aria-label", `${text.download} · ${heading.textContent}`);
    idLabel.textContent = text.assetId;
    tagsLabel.textContent = text.eventTags;
    packLicense.textContent = text.packLicense;
    if (clip.mapping_notes) {
      if (clip.filter_id === "reward") note.textContent = text.coins;
      else if (clip.original_filename === "metalClick.ogg") note.textContent = text.metal;
      else if (clip.filter_id === "ui") note.textContent = text.back;
    }
    updatePlayback(state);
  });
  return card;
}

function buildLibrary(data: Catalog) {
  for (const { id, scene } of data.filters) {
    const clips = clipsForFilter(data, id);
    const filter = button("btn audio-filter");
    filter.setAttribute("aria-controls", library.id);
    const label = element("span");
    const count = element("span", "audio-count", String(clips.length));
    filter.append(label, count);
    filter.addEventListener("click", () => {
      if (selected === id) return;
      if (!clips.some(clip => clip.id === player.activeId)) player.stop();
      selected = id;
      updateFilter();
    });
    filters.append(filter);
    filterButtons.set(id, filter);
    localize.push(() => { label.textContent = copy().filters[id]; });
    if (scene === null) continue;

    const section = element("section", "audio-scene");
    const heading = element("h2");
    heading.id = `audio-scene-${id}`;
    section.setAttribute("aria-labelledby", heading.id);
    const grid = element("ul", "audio-grid");
    grid.setAttribute("role", "list");
    grid.append(...clips.map(makeCard));
    section.append(heading, grid);
    sections.set(id, section);
    library.append(section);
    localize.push(() => { heading.textContent = copy().filters[id]; });
  }
  filters.hidden = false;
}

const credit = element("p");
const legal = element("p");
const synthLink = element("a");
footer.append(credit, legal, synthLink);

function updateLocale() {
  const locale = getLocale();
  const prefix = locale === "en" ? "" : "/" + locale;
  const text = STRINGS[locale];
  document.title = `${text.title} — ${BRAND}`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", text.lede);
  title.textContent = text.title;
  lede.textContent = text.lede;
  filters.setAttribute("aria-label", text.scenes);
  retry.textContent = text.retry;
  credit.replaceChildren(`${text.credit} / `, link("https://www.kenney.nl/", CREDIT_SITE), ` · ${text.attribution}`);
  legal.textContent = text.legal;
  synthLink.href = `${prefix}/audio-envelope/`;
  synthLink.textContent = text.synth;
  for (const update of localize) update();
  updateFilter();
}

async function loadCatalog() {
  catalogError = false;
  retry.hidden = true;
  updateFilter();

  let data: Catalog;
  try {
    const response = await fetch("/audio-scenes/catalog.json");
    if (!response.ok) throw new Error(String(response.status));
    data = await response.json();
    if (!Array.isArray(data.filters) || !Array.isArray(data.items)) throw new Error("Invalid catalog");
  } catch {
    catalogError = true;
    retry.hidden = false;
    updateFilter();
    return;
  }

  catalog = data;
  buildLibrary(data);
  updateLocale();
}

retry.addEventListener("click", () => { void loadCatalog(); });
window.addEventListener("pagehide", player.stop);
onLocaleChange(updateLocale);
updateLocale();
void loadCatalog();
