import "../style.css";
import "../templates/templates.css";
import "./free-resources.css";
import {applyStaticText, mountLangSwitcher, onLocaleChange} from "../lib/i18n";
import {mountToolsMenu} from "../lib/navmenu";
mountToolsMenu(); mountLangSwitcher(); applyStaticText(document);
onLocaleChange(() => applyStaticText(document));
