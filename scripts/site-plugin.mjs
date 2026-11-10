import fs from "node:fs";
import path from "node:path";
import {
  analyticsHtml,
  bootScript,
  footerHtml,
  headerHtml,
  hostnameOf,
  robotsTxt,
  routeFromFile,
  seoBlock,
  siteOrigin,
  sitemapXml,
  stripInjectedSeo,
  verificationMetas,
} from "./site-meta.mjs";

function noindex(html) {
  return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
}

/** Vite plugin: shared chrome, canonical/hreflang/OG, empty-by-default integrations, sitemap. */
export function sitePlugin() {
  let outDir = "dist";
  let root = process.cwd();
  return {
    name: "pixjuice-site",
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const filename = ctx.filename || "";
        const route = routeFromFile(filename);
        const { origin } = siteOrigin();
        const host = hostnameOf(origin);
        let out = html;
        if (out.includes("<!-- kh:header -->")) out = out.replaceAll("<!-- kh:header -->", headerHtml(route));
        if (out.includes("<!-- kh:footer -->")) out = out.replaceAll("<!-- kh:footer -->", footerHtml());
        out = out.replaceAll("__SITE_ORIGIN__", origin).replaceAll("__SITE_HOST__", host);
        if (!out.includes("data-kh-seo") && route && !noindex(out)) {
          out = stripInjectedSeo(out);
          const block = [
            seoBlock(out, origin, route),
            verificationMetas(),
            bootScript(),
          ]
            .filter(Boolean)
            .join("\n  ");
          out = out.replace("</head>", `  ${block}\n</head>`);
        } else if (!out.includes("data-kh-boot")) {
          const extra = [verificationMetas(), bootScript()].filter(Boolean).join("\n  ");
          if (extra) out = out.replace("</head>", `  ${extra}\n</head>`);
        }
        if (!out.includes("data-kh-analytics")) {
          const analytics = analyticsHtml();
          if (analytics) out = out.replace("</body>", `${analytics}\n</body>`);
        }
        return out;
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        const { origin } = siteOrigin();
        if (url === "/sitemap.xml") {
          res.setHeader("content-type", "application/xml; charset=utf-8");
          res.end(sitemapXml(origin));
          return;
        }
        if (url === "/robots.txt") {
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end(robotsTxt(origin));
          return;
        }
        next();
      });
    },
    closeBundle() {
      const { origin } = siteOrigin();
      const dir = path.resolve(root, outDir);
      if (!fs.existsSync(dir)) return;
      fs.writeFileSync(path.join(dir, "sitemap.xml"), sitemapXml(origin));
      fs.writeFileSync(path.join(dir, "robots.txt"), robotsTxt(origin));
    },
  };
}
