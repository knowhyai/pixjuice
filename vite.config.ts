import { defineConfig } from "vite";

// Multi-page static build for Cloudflare Pages:
//   /                     catalog (index.html)
//   /editor/              effect editor (editor/index.html)
//   /sprite-sheet/        sprite sheet cutter & GIF maker (sprite-sheet/index.html)
//   /image-to-pixel-art/  image → pixel art converter (image-to-pixel-art/index.html)
//   /normal-map/          normal map generator (normal-map/index.html)
//   /pixel-art-upscaler/  pixel art upscaler (pixel-art-upscaler/index.html)
//   /credits/             attribution + licenses (credits/index.html)
//   /404.html             served by Cloudflare Pages for unknown routes
export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: "index.html",
        editor: "editor/index.html",
        sheet: "sprite-sheet/index.html",
        pixelart: "image-to-pixel-art/index.html",
        normalmap: "normal-map/index.html",
        upscaler: "pixel-art-upscaler/index.html",
        credits: "credits/index.html",
        notfound: "404.html",
      },
      output: {
        // pixelfx is most of the site (~1.2MB). The core stays one chunk; the 244 effect
        // modules split per category, so no chunk trips the 500KB warning, the home page
        // loads them all in parallel, and the editor fetches only the category it plays.
        // (The ?raw source copies stay as their own lazy chunks, untouched.)
        manualChunks(id) {
          if (id.includes("?raw")) return undefined;
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
