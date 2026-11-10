// /templates/gacha/ — site glue. The demo itself is the standalone vanilla build
// (main.js), imported for its side effect; this module only adds localization,
// the shared page chrome and the source-code section. Static imports run in
// order, so the globals gacha-core.js and skins.js define exist before main.js.

import "../../style.css";
import "../shared/skins.css";
import "../templates.css";
import "./standalone/styles.css";
import "../skins.js";
import "./gacha-core.js";
import "./standalone/main.js";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../../lib/i18n";
import { mountToolsMenu } from "../../lib/navmenu";
import { mountCodeBox } from "../codebox";

import indexHtml from "./standalone/index.html?raw";
import demoStyles from "./standalone/styles.css?raw";
import coreJs from "./gacha-core.js?raw";
import skinsJs from "../skins.js?raw";
import mainJs from "./standalone/main.js?raw";
import readme from "./standalone/README.md?raw";
import license from "./standalone/LICENSE?raw";
import configExample from "./standalone/config.example.json?raw";
import skinsCss from "../shared/skins.css?raw";

import {fontFiles, offlineStyles} from "../fonts";

mountToolsMenu();
mountLangSwitcher();
window.PixI18nRefresh = () => applyStaticText(document);
window.PixTranslate = t;

applyStaticText(document);
onLocaleChange(() => { applyStaticText(document); window.dispatchEvent(new Event("pixjuice-locale")); });

mountCodeBox(document.getElementById("codebox")!, [
  { name: "index.html", code: indexHtml },
  { name: "styles.css", code: offlineStyles(skinsCss + "\n" + demoStyles) },
  { name: "js/gacha-core.js", code: coreJs },
  { name: "js/skins.js", code: skinsJs },
  { name: "js/main.js", code: mainJs },
  { name: "config.example.json", code: configExample },
  { name: "README.md", code: readme },
  { name: "LICENSE", code: license },
  ...fontFiles,
], "pixjuice-gacha-template.zip");

// page-level dynamic text (counts, download hint)
const note = document.querySelector<HTMLElement>("[data-tpl-files]");
if (note) note.textContent = t("tpl.filesNote");
