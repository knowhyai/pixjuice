# PixJuice — finish summary

PixJuice is a fully static Vite + vanilla TS site (no backend, no analytics, no payments) that
recolors, previews, and exports the pixel effects from
[pixelfx](https://github.com/patch-gg/pixelfx) (MIT, by Patch and Hugo Duprez — credited in the
page footers and on `/credits/`).

## What was built this session

**`src/editor.ts` (new)** — the editor page, wiring every control that already existed in
`editor/index.html` to the libraries:

- **Routing**: reads `?fx=ice/frost-nova`; an unknown/missing id shows the `#ed-error` 404 box and
  hides the editor grid. Esc returns to the catalog. (The home page's `/` search is a separate
  entry and is untouched — verified it still works.)
- **Live preview** on `#stage` via `Player`; effect facts (size, fps, length, frame count, act
  timing, tags) in the meta panel.
- **Recolor** — `<select id="pal">` with the effect's own default plus 27 named ramps from
  upstream `PAL` (fire, ice, toxic, gold, mono, …), and three custom color inputs (`#c0–#c2`)
  expanded into a 9-stop interpolated ramp. Both paths set `style.palette` and re-render
  immediately (restarts the effect instance — works while paused too). Swatch strip reflects the
  active ramp; **reset** restores the effect default and re-syncs the color inputs. Style tweaks
  re-render silently; only real restarts (replay button, auto-replay) fire the synced SFX.
- **Dials**: seed + 🎲 random, flip H / flip V, angle (0–360°), glow (0–2), backdrop
  (none/dark/ground/sky/light/black), character toggle (re-lays-out the stage for act effects;
  row hidden when irrelevant), auto-replay toggle (hidden for loops), and a speed row (0.25–3×)
  added cleanly into the Look panel.
- **Transport**: play/pause, replay, scrubber with live `cur / total` time; the scrubber doesn't
  fight the animation while focused. `prefers-reduced-motion` starts paused mid-effect.
- **SFX**: family derived per category via `familyForCategory` (label shown), ▶ play, sync-on-
  restart toggle, mute, volume, and WAV export rendered offline from the same Web Audio graph.
  The seed input also re-seeds the sound; otherwise each effect sounds consistently like itself.
- **Exports — all real downloads, no placeholders** (buttons disable while busy; note line
  confirms name + size): **zip** of sheet PNG + Aseprite-style JSON, **PNG sheet**, **JSON**
  sidecar, **GIF** (honors `#gif-scale` 1×/2×/3×, nearest-neighbour upscale, transparency),
  **current-frame PNG** (snaps to the frame grid), **WAV**.

**Fixes to existing files** (each forced by a compile error or a functional bug, kept minimal):

- `src/lib/player.ts`: exported `placement` (exports.ts imports it); removed unused `isScreen`
  import and unused `bgKind` field.
- `src/lib/exports.ts`: dropped the unused `entry` parameter of `fxOptionsFor`.
- `src/types/gifenc.d.ts` (new): ambient types for gifenc (ships untyped).
- `src/lib/catalog.ts` + `src/types/pixelfx.d.ts`: import specifier `pixelfx/fx/index.js` →
  `pixelfx/fx/index` (the package's exports map appends `.js` itself; Vite couldn't resolve the
  double extension).
- `src/main.ts`: three type-level fixes (spread `append`, `fx.mod.act` narrowing, canvas kid
  wrapped in an array to dodge a TS contextual-typing quirk on the nested generic call).
- `src/style.css`: added `[hidden] { display: none !important; }` — `.ed-grid`'s `display: grid`
  was overriding the UA's hidden rule, so the 404 state couldn't hide the editor.

**`README.md` (new)** — install / dev / build / preview, Cloudflare Pages deploy via
`npx wrangler pages deploy dist --project-name=pixjuice`, project layout, credits.

## How to run

```sh
pnpm i
pnpm dev     # http://localhost:5173 — catalog at /, editor at /editor/?fx=<category>/<effect>
pnpm build   # tsc --noEmit && vite build  → dist/  (green)
```

## Verification (headless Chromium, dev server and production build)

36/36 automated checks passed, including pixel-level recolor proof and byte-level export checks:

- **Recolor works, for real**: paused at frost-nova's peak bloom, the stage showed 1419 blue / 2
  red pixels; after picking the **fire** preset (same moment re-seeked): 79 blue / 2069 red.
  Custom green mid-pick also showed on stage; reset returned the default ramp (swatch `#151a3d`).
  Same proof on the production build with fireball fire→ice (red 560→0, blue 0→498).
- **Every export downloads a real file** (saved via the browser's download event, then parsed):
  - `pixjuice-ice-frost-nova.png` sheet — 2592×2304 PNG (9 cols × 288 px, 103 frames)
  - `pixjuice-ice-frost-nova.json` — 103 frames, per-frame rects + durations, pivot, columns,
    loop flag, and the PixJuice settings recorded in `meta.pixjuice`
  - `…-…-.zip` — `unzip -t` clean, contains both files
  - `anim.gif` — GIF89a, 576×384 logical screen at the selected 2× (288×192 × 2), 103 frames
  - `-frame.png` — 288×192 PNG of the current moment
  - `.wav` — RIFF/WAVE, 44.1 kHz 16-bit stereo, ~198 KB
- Home page: 244 live tiles across 22 chips, `/` focuses search; 404 state and Esc-to-catalog
  verified; zero page errors in either page.

## Known gaps

- The shared player chunk is ~1.17 MB minified (~467 KB gzip): pixelfx bundles all 244 effects.
  Code-splitting by category would trim first load if it ever matters.
- GIF is 1-bit alpha (format limit): very soft glows get slightly crisp edges; the 2×/3× scale
  mitigates. Sheets/PNGs keep full alpha.
- Scrubbing an act effect can't go before t=0, so the wind-up region (-0.34 s on frost-nova)
  clamps to 0 when dragged all the way left.
- Browsers require one user gesture before audio: until any click/tap, the synced SFX stays
  silent (the ▶ play SFX button doubles as the unlock).
- `og:image` meta tags reference `/og.png`, which doesn't exist yet (pre-existing markup; social
  cards just fall back to no image).
- Custom 3-color ramps are interpolated to 9 stops; extreme picks can band more than the curated
  7–8-stop ramps. That's the trade for three picks instead of eight.
