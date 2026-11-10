# Save / Load System — game UI template

A production-ready save menu for indie games: multiple save slots with
thumbnails, timestamp, playtime and chapter; new game / overwrite / delete with
confirmation dialogs; an auto-save slot; JSON-file import and export; and
localStorage persistence.

Zero dependencies — plain HTML/CSS/JS. Double-click `index.html` and it runs.

```
index.html          page shell (loads the three scripts below)
styles.css          all demo styles + the Semi-Realistic dark gold skin
js/save-core.js     save engine: slots, read/write, sanitize, export/import (no DOM)
js/skins.js         shared skin registry (PixSkins global)
js/main.js          demo UI (builds into #app)
LICENSE             CC0 — do anything, no attribution required
```

## Integrate into your game

1. Copy `js/save-core.js` into your project and include it before your code
   (classic script, defines a `PixSave` global). It is DOM-free and storage-free
   by injection, so it also runs in Node for unit tests.
2. Drive it directly:

   ```js
   var adapter = window.localStorage;          // or PixSave.memoryAdapter() for tests
   var NS = "my-game-saves";                   // your storage namespace
   var entry = Object.assign(myGameState, { slot: "s1", thumb: dataUrl, auto: false });
   PixSave.write(adapter, NS, entry);          // stamps v + ts, JSON-stringifies
   var saved = PixSave.read(adapter, NS, "s1"); // null when empty/corrupt
   PixSave.remove(adapter, NS, "s1");
   ```

3. The save-file shape is plain JSON — swap the demo fields for your own state:

   ```json
   { "v": 1, "slot": "s1", "name": "Hero", "chapter": 2, "level": 7,
     "gold": 340, "x": 4, "y": 3, "playtime": 5437, "ts": 1760000000000,
     "thumb": "data:image/png;base64,…", "auto": false }
   ```

4. `index.html` + `js/main.js` + `styles.css` are the reference UI (slot cards,
   confirm dialogs, import/export, autosave loop). The demo "game" is a tiny
   walkable hero — replace `step()`/`drawGame()` with your game; the menu only
   talks to `PixSave`.

## Feature notes

- **Slots** — ids are `s1…sN` plus `auto`. The demo exposes a slot-count setting;
  hard-code yours or keep the setting.
- **Auto-save** — the demo writes the `auto` slot every 30 s. Wire your own
  cadence; treat `auto` as read-only in your UI if you prefer.
- **Thumbnails** — a small PNG data-URL captured at save time (`makeThumb()` in
  the demo). Skip it if you render live previews instead.
- **Import / export** — `PixSave.exportText(entry)` produces pretty JSON for a
  download; `PixSave.parseImport(text)` validates a file before writing
  (`{ ok, entry } | { ok:false, error }`). Version-tagged (`v`), so you can
  migrate saves later.
- **Corrupt/foreign data** — every read passes `sanitize()`; bad entries come
  back as `null` instead of crashing the menu.

## Art assets (not bundled)

This ZIP contains no art — the demo renders its own shapes on canvas, so it runs
fully offline. If you want matching art (chest sprites, icons, tiles), grab it
from the PixJuice free asset library:

- <https://pixjuice.pages.dev/free-assets/> — 2D & 3D assets, free for
  commercial use (license on each asset page).

## License

Template code: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) —
public domain, use in commercial games, no attribution required.

Typography: Cinzel and Cormorant (Latin, weight 500), bundled in fonts/ for offline use. Font software remains SIL OFL 1.1; see fonts/Cinzel-OFL.txt and fonts/Cormorant-OFL.txt. Sources: https://github.com/google/fonts/tree/main/ofl/cinzel and https://github.com/google/fonts/tree/main/ofl/cormorant .
PixJuice wooden chest art is CC0 1.0 Universal, commercial use without attribution.
