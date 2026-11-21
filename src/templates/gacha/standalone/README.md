# Gacha & Lucky Wheel — game UI template

A production-ready gacha panel for indie games: card pool (single / ×10 pulls)
with N/R/SR/SSR rarities, published drop rates, SSR pity counter, ten-pull
guarantee, a lucky wheel, pull history, chest-opening animation and a fully
configurable JSON (rates, prizes, pity, currency).

Zero dependencies — plain HTML/CSS/JS. Double-click `index.html` and it runs.

```
index.html            page shell (loads the three scripts below)
styles.css            all demo styles + the Semi-Realistic dark gold skin
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
  "pity":     { "ssr": 90, "sr": 10 },   // hard SSR guarantee; minimum batch size for the SR+ guarantee
  "items": [
    { "id": "wooden-sword", "name": "Wooden Sword", "rarity": "N", "weight": 1 },
    { "id": "excalibur",    "name": "Dawn Relic",    "rarity": "SSR" }
  ]
}
```

- `rates` — base chance per rarity. Normalized automatically, so they only need
  to be finite, non-negative numbers with at least one positive value.
- `items` — the prize pool. At least one item per rarity is required; ids must be
  unique. Within a rarity, an item's chance is proportional to `weight`, which must be positive and finite when supplied.
- `pity.ssr` — the pull at this ceiling is forced SSR (90 means at most 89 misses). `0` disables hard pity.
- `pity.sr` — minimum batch size for at least one SR or better. The live button
  and lab both use batches of 10. At a threshold above 10 neither batch
  guarantees SR+. Lab leftovers are singles. `currency.multi` prices the live ×10.
- The lucky wheel uses the same `items`; each segment's chance is
  `weight / total weight` (shown live in the odds panel).

In the demo: **Load config.json** applies a file, **Download config.json**
exports the current state of the panel.


## Rate lab

The demo includes a rate lab under the playable panel. It runs the same
`PixGacha` rules as the card pool (not the crate reel) for many simulated
pulls so you can compare:

- advertised rates (`rates` / `itemOdds` — no pity)
- for **single pulls with hard pity enabled**, the closed-form effective SSR
  rate `p / (1 − (1−p)^N)`. This formula does **not** describe ten-pulls or
  the SR+ guarantee.
- observed frequencies from the live engine, including forced SSR / SR+ counts.
  The denominator is the number of individual pulls in the run.

`pity.ssr = 0` disables the SSR hard guarantee. The minimum SR+ batch size
`pity.sr` is independent of SSR pity.
Pity 1 forces every single pull to SSR.

This is a design check on *this* template, not a recreation of a commercial
gacha table. Observed numbers have sampling error. Download config.json from
the demo or the lab — it is the same live object the engine just used.

`PixGacha.simulate(config, { pulls, mode, rng })` and
`PixGacha.hardPityEffectiveRate(p, n)` are also callable from Node tests.
`hardPityEffectiveRate` returns the base rate `p` when `n < 1` (disabled).

## Crate opening and offline play

The default mode is a horizontal crate reel with three original treasure pools.
`js/case-core.js` selects the result first; the reel's `winnerIndex` and
`stopOffset()` keep it aligned. Quick opening, skipping and reduced motion leave
the result unchanged. Sound is synthesized locally and starts muted.

The seven original rarity odds are 50%, 25%, 14%, 7%, 2.5%, 1.2% and 0.3%.
Each opening costs 100 free demo gems. These independent draws have no pity.
The card pool and wheel keep their separate configuration and rules.

All crate icons are original inline SVG. The ZIP bundles the matching chest
sprites under `assets/chest-wood/` for the Semi-Realistic dark gold interface. Unzip and open index.html:
no network connection is needed. Use the language selector for five languages.
The source library remains at https://pixjuice.pages.dev/free-assets/ .

## License

Template code: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) —
public domain, use in commercial games, no attribution required. The demo art
is also CC0 1.0 Universal: commercial use, redistribution and resale without attribution.

Typography: Cinzel and Cormorant (Latin, weight 500), bundled in fonts/ for offline use. Font software remains SIL OFL 1.1; see fonts/Cinzel-OFL.txt and fonts/Cormorant-OFL.txt. Sources: https://github.com/google/fonts/tree/main/ofl/cinzel and https://github.com/google/fonts/tree/main/ofl/cormorant .
PixJuice wooden chest art is CC0 1.0 Universal, commercial use without attribution.
