/* PixJuice game templates — shared skin registry (vanilla, zero deps).
   Ships inside the downloadable template ZIP as js/skins.js (classic script):
   it defines one global, PixSkins, used by every template demo to list the four
   official skins and to resolve which chest sprite set each skin should show.
   The matching CSS variables live in the [data-skin] blocks of styles.css. */

(function (root) {
  "use strict";

  var SKINS = ["realistic", "stylized", "clean-low-poly", "pixel-art"];

  /* i18n keys for the switcher labels (site resolves them; the ZIP ships English text) */
  var SKIN_KEYS = {
    realistic: "tpl.skin.realistic",
    stylized: "tpl.skin.stylized",
    "clean-low-poly": "tpl.skin.lowpoly",
    "pixel-art": "tpl.skin.pixel",
  };

  /* Each official skin shows the matching chest style from the PixJuice asset library. */
  var CHEST_STYLE = {
    realistic: "realistic",
    stylized: "stylized",
    "clean-low-poly": "clean-low-poly",
    "pixel-art": "pixel-art",
  };

  /** Base URL of the sprite folder for a skin, e.g. <base>/realistic/wood/intact/sprites */
  function chestSpriteBase(skin, assetsBase) {
    var style = CHEST_STYLE[skin] || "realistic";
    return (assetsBase || "/free-assets/chest-wood") + "/" + style + "/wood/intact/sprites";
  }

  /** The library detail page that documents the demo art (wood chest, intact). */
  var ASSET_PAGE = "/free-assets/chest-wood-realistic-wood-intact/";

  root.PixSkins = {
    SKINS: SKINS,
    SKIN_KEYS: SKIN_KEYS,
    chestSpriteBase: chestSpriteBase,
    ASSET_PAGE: ASSET_PAGE,
    isSkin: function (s) {
      return SKINS.indexOf(s) !== -1;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
