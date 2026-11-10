// /templates/ — index page for the game-templates category of the free asset
// library. The two live cards are static (SEO-visible); the "coming soon" grid
// renders here so the names localize with the language picker.

import "../style.css";
import "../templates/shared/skins.css";
import "../templates/templates.css";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";

mountToolsMenu();
mountLangSwitcher();
applyStaticText(document);
onLocaleChange(() => applyStaticText(document));

const SOON: { key: string; icon: string }[] = [
  { key: "inventory", icon: '<rect x="4" y="7" width="16" height="13" rx="1.5"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/>' },
  { key: "shop", icon: '<path d="M4 8h16l-1.5 12h-13L4 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>' },
  { key: "quests", icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>' },
  { key: "achievements", icon: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5 7 21l5-2.5L17 21l-2-7.5"/>' },
  { key: "dailies", icon: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 9h16M8 5V3M16 5V3"/>' },
  { key: "settings", icon: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>' },
  { key: "dialog", icon: '<rect x="3" y="5" width="18" height="11" rx="2"/><path d="M8 20l1.5-4H8"/>' },
  { key: "leaderboard", icon: '<rect x="4" y="12" width="4.5" height="8"/><rect x="10" y="7" width="4.5" height="13"/><rect x="16" y="10" width="4.5" height="10"/>' },
  { key: "stats", icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 15v-3M12 15V9M16 15v-5"/>' },
  { key: "skills", icon: '<circle cx="12" cy="5" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M12 7.5V12m0 0-4.5 4m4.5-4 4.5 4"/>' },
];

const grid = document.getElementById("soon-grid");
if (grid) {
  for (const item of SOON) {
    const card = document.createElement("div");
    card.className = "tpl-card soon";
    card.innerHTML = `
      <span class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#8d87a6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
      </span>
      <b data-i18n="soon.${item.key}">${t(`soon.${item.key}`)}</b>
      <span class="go" data-i18n="tplIndex.soonBadge">coming soon</span>`;
    grid.appendChild(card);
  }
  applyStaticText(grid);
  onLocaleChange(() => applyStaticText(grid));
}
