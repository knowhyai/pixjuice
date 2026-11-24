import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { createRoutingMiddleware } from "./scripts/preview-routing.mjs";

// Multi-page static build for Cloudflare Pages:
//   /                      homepage (index.html)
//   /effects/              full effects catalog (effects/index.html)
//   /editor/              effect editor (editor/index.html)
//   /sprite-sheet/        sprite sheet cutter & GIF maker (sprite-sheet/index.html)
//   /image-to-pixel-art/  image → pixel art converter (image-to-pixel-art/index.html)
//   /normal-map/          normal map generator (normal-map/index.html)
//   /pixel-art-upscaler/  pixel art upscaler (pixel-art-upscaler/index.html)
//   /credits/             attribution + licenses (credits/index.html)
//   /templates/           game template library (templates/index.html)
//   /templates/<slug>/    one template demo page (gacha, save-load)
//   /free-assets/         2D/3D asset library (free-assets/index.html)
//   /free-assets/<id>/    one asset detail page per manifest entry (generated)
//   /404.html             served by Cloudflare Pages for unknown routes

// asset detail pages are generated from the manifest — pick them up dynamically
function assetDetailInputs(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const d of readdirSync("free-assets", { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const p = `free-assets/${d.name}/index.html`;
      if (statSync(p).isFile()) out[`asset-${d.name}`] = p;
    }
  } catch {
    /* no generated pages yet */
  }
  return out;
}

export default defineConfig({
  plugins: [
    {
      name: "pages-parity-routing",
      // vite preview would otherwise SPA-fallback every unknown path to the
      // homepage (200). Serve like Cloudflare Pages instead: 301 directory
      // pages to their slashed URL, 301 /en/* to the unprefixed English URL
      // (English is the default locale), 404 everything else via 404.html.
      configurePreviewServer(server) {
        server.middlewares.use(createRoutingMiddleware(resolve(server.config.root, "dist")));
      },
    },
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: "index.html",
        effects: "effects/index.html",
        editor: "editor/index.html",
        textfit: "text-fit/index.html",
        envelope: "audio-envelope/index.html",
        camerashake: "camera-shake/index.html",
        sheet: "sprite-sheet/index.html",
        pixelart: "image-to-pixel-art/index.html",
        normalmap: "normal-map/index.html",
        upscaler: "pixel-art-upscaler/index.html",
        credits: "credits/index.html",
        templates: "templates/index.html",
        gacha: "templates/gacha/index.html",
        save: "templates/save-load/index.html",
        assets: "free-assets/index.html",
        resources: "free-resources/index.html",
        feel: "feel/index.html",
        feelhit: "feel/hit/index.html",
        feelcamera: "feel/camera/index.html",
        feelspring: "feel/spring/index.html",
        feelmove: "feel/move/index.html",
        feeljump: "feel/jump/index.html",
        feelboss: "feel/boss-hp/index.html",
        ...assetDetailInputs(),
        notfound: "404.html",
      },
      output: {
        // pixelfx is most of the site (~1.2MB). The core stays one chunk; the 244 effect
        // modules split per category, so no chunk trips the 500KB warning, the effects page
        // loads them all in parallel, and the editor fetches only the category it plays.
        // (The ?raw source copies stay as their own lazy chunks, untouched.)
        manualChunks(id) {
          if (id.includes("?raw")) return undefined;
          // Home bookmark compatibility only needs category metadata.
          if (/node_modules\/pixelfx\/src\/fx\/categories\.js$/.test(id)) return "fx-categories";
          // the all-effects aggregator stays out of the core chunk: only the catalog page needs it
          if (/node_modules\/pixelfx\/src\/fx\/index\.js$/.test(id)) return "fx-catalog";
          const fx = id.match(/node_modules\/pixelfx\/src\/fx\/([a-z-]+)\//);
          if (fx) return `fx-${fx[1]}`;
          if (id.includes("node_modules/pixelfx/")) return "pixelfx";
          if (id.includes("node_modules/jsfxr/")) return "jsfxr";
          if (id.includes("node_modules/gifenc/")) return "gifenc";
          if (/node_modules\/(@breezystack\/)?lamejs\//.test(id)) return "lamejs";
          return undefined;
        },
      },
    },
  },
});
