# PixJuice

Recolor, preview, and export pixel skill effects for games — entirely in the browser.

PixJuice wraps the [pixelfx](https://github.com/patch-gg/pixelfx) effect library by Patch and
Hugo Duprez (MIT License) with a live editor: pick an effect from the catalog, recolor it with
palette presets or your own three-color ramp, dial in seed / mirror / angle / glow / speed, then
export sprite sheets, Aseprite-style JSON, animated GIFs, single frames, and chip-style WAV sound
effects. No backend, no accounts — everything renders client-side.

## Run it

```sh
pnpm i        # install dependencies
pnpm dev      # local dev server (Vite)
pnpm build    # type-check (tsc --noEmit) + production build into dist/
pnpm preview  # serve the production build locally
```

## Deploy

The site is fully static. For Cloudflare Pages:

```sh
pnpm build
npx wrangler pages deploy dist --project-name=pixjuice
```

Set `PUBLIC_SITE_URL` in the Pages project (build-time) when a custom domain exists. Until then the canonical host stays `https://pixjuice.pages.dev`.

## Integrations

`pnpm check:integrations` prints which hooks are set. It always exits 0, and an empty value renders nothing. Copy [`.env.example`](.env.example) to `.env` for local builds. These names are public (they end up in HTML) — do not put secrets in them.

| Key | When set |
| --- | --- |
| `PUBLIC_SITE_URL` | Canonical origin, `sitemap.xml`, `robots.txt`, Open Graph, JSON-LD, and URLs written into exports. Unset → `https://pixjuice.pages.dev`. |
| `PUBLIC_GSC_VERIFICATION` | `<meta name="google-site-verification">` |
| `PUBLIC_BING_VERIFICATION` | `<meta name="msvalidate.01">` |
| `PUBLIC_YANDEX_VERIFICATION` | `<meta name="yandex-verification">` |
| `PUBLIC_GA4_ID` | GA4 gtag (`G-…` only) |
| `PUBLIC_CLARITY_ID` | Microsoft Clarity |
| `PUBLIC_PLAUSIBLE_DOMAIN` | Plausible (`data-domain` hostname) |
| `PUBLIC_NEWSLETTER_URL` | Footer newsletter link (`http` or `https`) |

Language URLs are the same page plus `?lang=zh|ja|ko|es` (English and `x-default` omit the parameter). hreflang is `en`, `zh-Hans`, `ja`, `ko`, `es`.

## Layout

```
index.html            catalog: every effect playing live, search + category chips
editor/index.html     the editor (?fx=ice/frost-nova) — loads src/editor.ts
credits/index.html    attribution + licenses (pixelfx MIT LICENSE & NOTICE)
404.html              served by the host for unknown routes
src/main.ts           catalog page logic
src/editor.ts         editor: wires every control to the libs below
src/lib/catalog.ts    normalized list of all pixelfx effects
src/lib/player.ts     live canvas player (palette, seed, flip, angle, glow, backdrop, transport)
src/lib/exports.ts    sprite-sheet PNG, Aseprite-style JSON, GIF, single-frame PNG, downloads
src/lib/sfx.ts        Web Audio chip SFX per effect family + offline WAV render
src/lib/zip.ts        minimal stored-ZIP writer (sheet + JSON in one click)
public/licenses/      upstream LICENSE and NOTICE files
```

## Credits

- Effects: [pixelfx](https://github.com/patch-gg/pixelfx) by Patch and Hugo Duprez — MIT License
  (full text in [`public/licenses/pixelfx-LICENSE.txt`](public/licenses/pixelfx-LICENSE.txt)).
- GIF encoding: [gifenc](https://github.com/mattdesl/gifenc) — MIT License.

PixJuice is MIT Licensed.
