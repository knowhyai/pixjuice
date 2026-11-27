# Stage Results

Extract the ZIP and open `index.html` in a browser. Edit the result in the right rail. Retry replays the reveal, and Continue and Return display feedback. Reduced-motion preferences skip the reveal animation.

Choose Rite, Honor, or Report in the right rail. The editor saves normalized configuration, including `look`, under `pix-tpl-settlement-v2` in localStorage. Exported JSON includes the selected look. Missing or unknown looks use Rite. Export JSON to move a configuration between browsers, or import `config.example.json` for the sample victory. Configuration stays in memory for the session if browser storage is unavailable.

## Integration

Load `js/settle-core.js` to use the DOM-free `PixSettle` global. Pass a result object to `validateConfig(raw)` and read `result.config` when `result.ok` is true. Calling it without an argument returns the sample victory. It discards unknown fields and limits each list to 12 entries. The demo accepts JSON files up to 128 KiB.

- `outcome` accepts `victory`, `defeat`, or `clear`. `title` and `subtitle` are the stage name and context.
- `grade` accepts S through D. Pass an empty string or omit it to use `gradeFromScore(score)`. The inclusive thresholds are S at 12,000, A at 9,000, B at 6,000, C at 3,000, and D below 3,000.
- `starMax` is 1–5 and defaults to 3. `stars` is clamped between zero and that maximum.
- `score` is a nonnegative integer capped at 999,999,999. The UI displays it as a dedicated stat tile.
- `stats` entries are `{ id, label, value }` with a number or short string for the value. Use `formatDuration(seconds)` to produce `mm:ss` or `h:mm:ss` for a time stat.
- `rewards` entries are `{ id, name, count, rarity? }`. Counts must be finite numbers and are clamped to nonnegative integers up to 999,999,999. Rows with invalid counts are dropped.

The standalone UI renders into `#app`. Adapt its action handlers in `js/main.js` to your game. Sample labels have translations in `js/strings.js`; select a bundled language using the HTML `lang` attribute.

Template code is CC0. The bundled fonts are distributed under their accompanying OFL licenses.
