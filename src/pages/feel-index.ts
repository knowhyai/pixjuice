// /feel/ — Game Feel Lab section home. Catalog of the two live recipes first;
// problem entry and the four domains (support, physicality, amplification,
// context) follow. Domains without a recipe stay unlinked.

import "../style.css";
import "../templates/templates.css";
import "./feel.css";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";

mountToolsMenu();
mountLangSwitcher();
applyStaticText(document);
onLocaleChange(() => {
  applyStaticText(document);
  document.title = `${t("feelIndex.h1")} – PixJuice`;
});
document.title = `${t("feelIndex.h1")} – PixJuice`;
