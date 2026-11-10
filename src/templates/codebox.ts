// Source-code section for template pages: tabbed file viewer with per-file copy
// and a "download ZIP" that assembles the exact standalone template (the same
// strings the viewer shows) into a ZIP via the repo's store-method zip writer.

import { makeZip, type ZipEntry } from "../lib/zip";
import { applyStaticText, onLocaleChange, t } from "../lib/i18n";
import { el } from "../lib/el";

export interface CodeFile {
  /** path inside the ZIP, e.g. "index.html" or "js/main.js" */
  name: string;
  code: string;
  data?: Uint8Array;
}

const encoder = new TextEncoder();


export function mountCodeBox(container: HTMLElement, files: CodeFile[], zipName: string, prepare?: () => Promise<ZipEntry[]>): void {
  // Keep downloadable art links usable on branch previews as well as production.
  files = files.map((file) => ({ ...file, code: file.code.replaceAll("https://pixjuice.pages.dev", location.origin) }));
  container.innerHTML = "";
  const wrap = el("div", { className: "codebox" });

  const tabs = el("div", { className: "codebox-tabs", role: "tablist" });
  const pre = el("pre", { className: "codebox-pre" });
  const code = el("code", {});
  pre.appendChild(code);

  let current = files[0]?.name ?? "";
  const buttons: Record<string, HTMLButtonElement> = {};

  const show = (name: string) => {
    current = name;
    const f = files.find((x) => x.name === name);
    code.textContent = f ? f.code : "";
    for (const [n, b] of Object.entries(buttons)) {
      b.classList.toggle("on", n === name);
      b.setAttribute("aria-selected", n === name ? "true" : "false");
    }
  };

  for (const f of files) {
    const b = el("button", {
      className: "codebox-tab",
      role: "tab",
      type: "button",
      text: f.name,
      "aria-selected": "false",
      onclick: () => show(f.name),
    });
    buttons[f.name] = b;
    tabs.appendChild(b);
  }

  const actions = el("div", { className: "codebox-actions" });
  const copy = el("button", {
    className: "tpl-btn",
    type: "button",
    text: t("tpl.copy"),
    "data-i18n": "tpl.copy",
    onclick: async () => {
      const f = files.find((x) => x.name === current);
      if (!f) return;
      try {
        await navigator.clipboard.writeText(f.code);
        copy.textContent = t("tpl.copied");
        setTimeout(() => {
          copy.textContent = t("tpl.copy");
          applyStaticText(copy);
        }, 1400);
      } catch {
        /* clipboard blocked — selection still works */
      }
    },
  });
  actions.appendChild(copy);

  const dl = el("button", {
    className: "tpl-btn tpl-btn-accent",
    type: "button",
    text: t("tpl.download"),
    "data-i18n": "tpl.download",
    onclick: async () => {
      dl.disabled = true;
      try {
      const extras = prepare ? await prepare() : [];
      const entries: ZipEntry[] = files.map((f) => ({ name: f.name, data: f.data ?? encoder.encode(f.code) }));
      const blob = makeZip(entries.concat(extras));
      const a = el("a", { href: URL.createObjectURL(blob), download: zipName });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 500);
      } finally { dl.disabled = false; }
    },
  });
  actions.appendChild(dl);

  wrap.appendChild(tabs);
  wrap.appendChild(actions);
  wrap.appendChild(pre);
  container.appendChild(wrap);

  show(files[0]?.name ?? "");
  onLocaleChange(() => applyStaticText(wrap));
}
