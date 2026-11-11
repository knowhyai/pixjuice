// /feel/ — Game Feel Lab section home. Static card list; one recipe today
// (hit feel), structured so future recipes just add another card.

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
