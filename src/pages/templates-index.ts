// /templates/ — index page for the game-templates category of the free asset
// library. The two live cards are static (SEO-visible); the "coming soon" grid
// renders here so the names localize with the language picker.

import "../style.css";
import "../templates/shared/skins.css";
import "../templates/templates.css";
import { applyStaticText, mountLangSwitcher, onLocaleChange } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";

mountToolsMenu();
mountLangSwitcher();
applyStaticText(document);
onLocaleChange(() => applyStaticText(document));
