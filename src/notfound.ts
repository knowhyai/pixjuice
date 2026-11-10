// 404 page: same language switch and header menus as the rest of the site. No catalog.
import "./style.css";
import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";
import { mountToolsMenu } from "./lib/navmenu";

applyStaticText();
mountLangSwitcher();
mountToolsMenu();
if (getLocale() !== "en") document.title = t("title.notfound");
onLocaleChange(() => {
  document.title = t("title.notfound");
});
