// The credits page is static prose — translation just swaps the tagged text nodes in place.

import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";

applyStaticText();
mountLangSwitcher();
if (getLocale() !== "en") document.title = t("title.credits");
onLocaleChange(() => {
  document.title = t("title.credits");
});
