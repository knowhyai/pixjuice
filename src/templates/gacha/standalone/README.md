# Gacha & Lucky Wheel — game UI template

A production-ready gacha panel for indie games: card pool (single / ×10 pulls)
with N/R/SR/SSR rarities, published drop rates, SSR pity counter, ten-pull
guarantee, a lucky wheel, pull history, chest-opening animation and a fully
configurable JSON (rates, prizes, pity, currency).

Zero dependencies — plain HTML/CSS/JS. Double-click `index.html` and it runs.

```
index.html            page shell (loads the three scripts below)
styles.css            all demo styles + the four official skins ([data-skin] blocks)
js/gacha-core.js      rules engine: rates, pity, pulls, wheel odds (no DOM)
js/skins.js           shared skin registry (PixSkins global)
js/main.js            demo UI (builds into #app)
config.example.json   the default configuration, as a starting point
LICENSE               CC0 — do anything, no attribution required
```

## Integrate into your game

1. Copy `js/gacha-core.js` into your project and include it before your code
   (classic script, defines a `PixGacha` global). It is DOM-free, so it also runs
   in Node for unit tests.
2. Drive it directly:

   ```js
   var loaded = PixGacha.validateConfig(myConfigJson); // { ok, config } | { ok:false, error }
   var state = PixGacha.makeState(0, 0);               // pity counters — persist these!
   var out = PixGacha.pull(loaded.config, state, 10);  // { results: [item…], state }
   ```

   Persist `out.state` (the pity counters) with the player's save data.
3. `index.html` + `js/main.js` + `styles.css` are the reference UI (results grid,
   chest animation, wheel, history, settings). Reuse as-is or restyle — the UI
   talks to the engine only through the API above.

## Configuration (JSON)

```jsonc
{
  "currency": { "name": "Gems", "single": 100, "multi": 1000 },
  "rates":    { "N": 0.79, "R": 0.15, "SR": 0.05, "SSR": 0.01 }, // normalized to sum 1
  "pity":     { "ssr": 90, "sr": 10 },   // hard SSR guarantee; multi-batch length for the SR+ guarantee
  "items": [
    { "id": "wooden-sword", "name": "Wooden Sword", "rarity": "N", "weight": 1 },
    { "id": "excalibur",    "name": "Excalibur",    "rarity": "SSR" }
  ]
}
```

- `rates` — base chance per rarity. Normalized automatically, so they only need
  to be non-negative.
- `items` — the prize pool. At least one item per rarity is required; ids must be
  unique. Within a rarity, an item's chance is proportional to `weight`.
- `pity.ssr` — the pull at this ceiling is forced SSR (90 means at most 89 misses).
- `pity.sr` — a pull batch of this size (e.g. 10) always contains at least one
  SR or better.
- The lucky wheel uses the same `items`; each segment's chance is
  `weight / total weight` (shown live in the odds panel).

In the demo: **Load config.json** applies a file, **Download config.json**
exports the current state of the panel.

## Art assets (not bundled)

This ZIP contains no art. The demo's chest-opening animation loads the wooden
chest sprite sets from the PixJuice free asset library at runtime:

- Library entry: <https://pixjuice.pages.dev/free-assets/chest-wood-realistic-wood-intact/>
- Sprite URLs used by the demo:
  `https://pixjuice.pages.dev/free-assets/chest-wood/<style>/wood/intact/sprites/{idle,open,close,locked_shake,open_burst}.png`
  with `<style>` one of `realistic`, `stylized`, `clean-low-poly`, `pixel-art`
  (one set per skin, switched automatically).
- CC0 1.0 Universal — commercial use without attribution.

To run fully offline: download the five sprites for one style, put them next to
`index.html` (e.g. `assets/sprites/`), and in `js/main.js` set

```js
var ASSETS_BASE = "assets/chest-wood"; // folder containing <style>/wood/intact/sprites
```

If the sprites can't load, the demo skips the chest animation and still works.

## License

Template code: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) —
public domain, use in commercial games, no attribution required. The demo art
is also CC0 1.0 Universal: commercial use, redistribution and resale without attribution.

Typography: Cinzel and Cormorant (Latin, weight 500), bundled in fonts/ for offline use. Font software remains SIL OFL 1.1; see fonts/Cinzel-OFL.txt and fonts/Cormorant-OFL.txt. Sources: https://github.com/google/fonts/tree/main/ofl/cinzel and https://github.com/google/fonts/tree/main/ofl/cormorant .
PixJuice wooden chest art is CC0 1.0 Universal, commercial use without attribution.
Pixel Art uses bundled Silkscreen Latin 400, SIL OFL 1.1: fonts/Silkscreen-OFL.txt. Source: https://github.com/google/fonts/tree/main/ofl/silkscreen .
