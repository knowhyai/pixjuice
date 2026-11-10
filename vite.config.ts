import { defineConfig } from "vite";

// Multi-page static build for Cloudflare Pages:
//   /               catalog (index.html)
//   /editor/        effect editor (editor/index.html)
//   /sprite-sheet/  sprite sheet cutter & GIF maker (sprite-sheet/index.html)
//   /credits/       attribution + licenses (credits/index.html)
//   /404.html       served by Cloudflare Pages for unknown routes
export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: "index.html",
        editor: "editor/index.html",
        sheet: "sprite-sheet/index.html",
        credits: "credits/index.html",
        notfound: "404.html",
      },
    },
  },
});
