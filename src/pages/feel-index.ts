// /feel/ — Game Feel Lab section home. Four domains (support, physicality,
// amplification, context); one live recipe today (hit feel, under amplification).

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
