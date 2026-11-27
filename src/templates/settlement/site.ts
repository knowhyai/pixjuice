import "../../style.css";
import "../shared/skins.css";
import "../templates.css";
import "./standalone/styles.css";
import "../skins.js";
import "./settle-core.js";
import "./strings.js";
import "./standalone/main.js";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../../lib/i18n";
import { mountToolsMenu } from "../../lib/navmenu";
import { mountCodeBox } from "../codebox";

import indexHtml from "./standalone/index.html?raw";
import demoStyles from "./standalone/styles.css?raw";
import coreJs from "./settle-core.js?raw";
import skinsJs from "../skins.js?raw";
import stringsJs from "./strings.js?raw";
import configJson from "./standalone/config.example.json?raw";
import mainJs from "./standalone/main.js?raw";
import readme from "./standalone/README.md?raw";
import license from "./standalone/LICENSE?raw";
import skinsCss from "../shared/skins.css?raw";

import {fontFiles, offlineStyles} from "../fonts";

mountToolsMenu();
mountLangSwitcher();
window.PixI18nRefresh = () => applyStaticText(document);
window.PixTranslate = t;
window.dispatchEvent(new Event("pixjuice-locale"));

applyStaticText(document);
onLocaleChange(() => { applyStaticText(document); window.dispatchEvent(new Event("pixjuice-locale")); });

mountCodeBox(document.getElementById("codebox")!, [
  { name: "index.html", code: indexHtml },
  { name: "styles.css", code: offlineStyles(skinsCss + "\n" + demoStyles) },
  { name: "js/settle-core.js", code: coreJs },
  { name: "js/skins.js", code: skinsJs },
  { name: "js/main.js", code: mainJs },
  { name: "js/strings.js", code: stringsJs },
  { name: "config.example.json", code: configJson },
  { name: "README.md", code: readme },
  { name: "LICENSE", code: license },
  ...fontFiles,
], "pixjuice-settlement-template.zip");

