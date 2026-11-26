import "../style.css";
import "../templates/templates.css";
import "./free-resources.css";
import "./free-icons.css";
import { applyStaticText, getLocale, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";

const filters = document.querySelector<HTMLElement>(".fi-filters")!;
const buttons = [...filters.querySelectorAll<HTMLButtonElement>(".fa-chip[data-filter]")];
const cards = [...document.querySelectorAll<HTMLElement>(".fi-page .resource-card[data-category]")];
const count = document.querySelector<HTMLElement>(".fi-count")!;
let category = "all";

function renderFilter(): void {
  let visible = 0;
  for (const card of cards) {
    card.hidden = category !== "all" && card.dataset.category !== category;
    if (!card.hidden) visible++;
  }
  for (const button of buttons) {
    const selected = button.dataset.filter === category;
    button.classList.toggle("on", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  count.textContent = t("fi.count", { count: visible });
}

function renderLocale(): void {
  applyStaticText(document);
  const locale = getLocale();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const links = document.querySelectorAll<HTMLAnchorElement>('.resources-related a[href^="/"], footer a[href^="/"]');
  for (const link of links) {
    const path = link.getAttribute("href")!.replace(/^\/(zh|ja|ko|es)(?=\/)/, "");
    link.setAttribute("href", prefix + path);
  }
  renderFilter();
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    category = button.dataset.filter!;
    renderFilter();
  });
}

mountToolsMenu();
renderLocale();
onLocaleChange(renderLocale);
filters.hidden = false;
count.hidden = false;
