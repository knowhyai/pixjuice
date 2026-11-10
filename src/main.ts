// The catalog: every effect playing live from its own code. Tiles start when they scroll into
// view; clicking one opens the editor with that effect.

import "./style.css";
import { CATALOG, CATEGORIES, isScreen, type CatalogEntry } from "./lib/catalog";
import { Player, defaultStyle } from "./lib/player";
import { applyStaticText, fxDesc, fxName, getLocale, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";
import { download } from "./lib/exports";
import { vipInit } from "./lib/vip";

/** Localized display name for a category id; unknown ids fall back to the id itself. */
function catLabel(id: string): string {
  return t(`cat.${id}`);
}

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Tile corner label: "loop" or the play length, in the active language. */
function tileLen(fx: CatalogEntry): string {
  return fx.meta.loop ? t("home.loop") : `${+fx.meta.duration.toFixed(2)}s`;
}
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  kids: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

interface Tile {
  fx: CatalogEntry;
  fig: HTMLElement;
  nameEl: HTMLElement;
  lenEl: HTMLElement;
  player: Player | null;
  visible: boolean;
}

const tiles: Tile[] = [];
const sections: { id: string; sec: HTMLElement; head: HTMLElement; blurb: HTMLElement; list: CatalogEntry[] }[] = [];

function build() {
  const main = $("#grid");
  for (const c of CATEGORIES) {
    const list = CATALOG.filter((f) => f.cat === c.id);
    if (!list.length) continue;
    const grid = el("div", { className: "grid" });
    const head = el("h2", { textContent: catLabel(c.id) });
    const blurb = el("p", { className: "blurb", textContent: t(`blurb.${c.id}`) });
    const sec = el("section", { className: "cat", id: `cat-${c.id}` }, [
      el("div", { className: "sec-head" }, [head, blurb]),
      grid,
    ]);
    sections.push({ id: c.id, sec, head, blurb, list });
    for (const fx of list) {
      const cv = el("canvas", { ariaLabel: fx.name });
      const nameEl = el("b", { textContent: fxName(fx) });
      const lenEl = el("small", { textContent: tileLen(fx) });
      const fig = el("figure", { className: "tile", tabIndex: 0 }, [
        el("div", { className: "stage" }, [cv]),
        el("figcaption", {}, [nameEl, lenEl]),
      ]);
      const tile: Tile = { fx, fig, nameEl, lenEl, player: null, visible: false };
      const go = () => (location.href = `editor/?fx=${encodeURIComponent(fx.id)}`);
      fig.addEventListener("click", go);
      fig.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
      grid.append(fig);
      tiles.push(tile);
    }
    main.append(sec);
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const t = tiles.find((x) => x.fig === e.target);
        if (!t) continue;
        t.visible = e.isIntersecting;
        if (t.visible && !t.player) {
          const style = defaultStyle(t.fx);
          if (reduced) style.playing = false;
          t.player = new Player(
            t.fig.querySelector("canvas") as HTMLCanvasElement,
            t.fx,
            isScreen(t.fx.meta) ? 16 / 9 : 6 / 5,
            isScreen(t.fx.meta) ? 1 : 1.25,
            style,
          );
          if (reduced) t.player.seek(t.fx.meta.duration * 0.4);
        }
      }
    },
    { rootMargin: "300px" },
  );
  tiles.forEach((t) => io.observe(t.fig));
}

// ---- filters

const state = { cat: "all", q: "" };

// chip label text nodes, kept so a language switch can relabel them in place
const chipLabels: { id: string; node: Text }[] = [];

function chips() {
  const box = $("#chips");
  const mk = (id: string, label: string, n: number) => {
    const node = document.createTextNode(label);
    const b = el("button", { className: "chip", type: "button" }, [node, el("span", { textContent: String(n) })]);
    b.dataset.cat = id;
    b.addEventListener("click", () => setCat(id));
    box.append(b);
    chipLabels.push({ id, node });
  };
  mk("all", t("home.all"), CATALOG.length);
  for (const s of sections) mk(s.id, catLabel(s.id), s.list.length);
}

// ---- mobile: categories hide behind a toggle so the first screen shows tiles

const catToggle = $<HTMLButtonElement>("#cat-toggle");
const chipsBox = $("#chips");

/** The toggle names the active category (and shows ▾/▴ for the drawer state). */
function syncCatToggle() {
  const name = state.cat === "all" ? t("home.categories") : catLabel(state.cat);
  catToggle.textContent = `${name} ${chipsBox.classList.contains("open") ? "▴" : "▾"}`;
  catToggle.dataset.on = String(state.cat !== "all");
}

catToggle.addEventListener("click", () => {
  const open = chipsBox.classList.toggle("open");
  catToggle.setAttribute("aria-expanded", String(open));
  syncCatToggle();
});

// a desktop-width window shows the chip row itself; don't leave drawer state behind
matchMedia("(max-width: 940px)").addEventListener("change", (e) => {
  if (!e.matches) {
    chipsBox.classList.remove("open");
    catToggle.setAttribute("aria-expanded", "false");
    syncCatToggle();
  }
});

function setCat(id: string, fromHash = false) {
  state.cat = sections.some((s) => s.id === id) ? id : "all";
  document.querySelectorAll(".chip").forEach((b) =>
    b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.cat === state.cat)),
  );
  if (!fromHash)
    history.replaceState(null, "", state.cat === "all" ? location.pathname : `#${state.cat}`);
  filter();
  if (!fromHash) window.scrollTo({ top: 0 });
  chipsBox.classList.remove("open"); // picking a category closes the drawer; tiles come back
  catToggle.setAttribute("aria-expanded", "false");
  syncCatToggle();
}

function filter() {
  const q = state.q.trim().toLowerCase();
  let shown = 0;
  for (const s of sections) {
    let any = false;
    for (const fx of s.list) {
      const t = tiles.find((x) => x.fx === fx);
      if (!t) continue;
      const hit =
        (state.cat === "all" || state.cat === s.id) &&
        (!q ||
          [fx.id, fx.name, fx.meta.desc ?? "", ...(fx.meta.tags ?? []), fxName(fx), fxDesc(fx)]
            .join(" ")
            .toLowerCase()
            .includes(q));
      t.fig.hidden = !hit;
      any ||= hit;
      shown += hit ? 1 : 0;
    }
    s.sec.hidden = !any;
  }
  $("#none").hidden = shown > 0;
}

// ---- keyboard-friendly search

function wireSearch() {
  const q = $("#q") as HTMLInputElement;
  q.addEventListener("input", () => {
    state.q = q.value;
    filter();
  });
  document.addEventListener("keydown", (e) => {
    const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? "");
    if (e.key === "/" && !typing) {
      e.preventDefault();
      q.focus();
      q.select();
    } else if (e.key === "Escape" && e.target === q) {
      if (q.value) {
        q.value = "";
        state.q = "";
        filter();
      } else q.blur();
    }
  });
}

// ---- VIP pack builder: category / whole-library ZIPs (VIP; the button itself
// is intercepted by the license guard until activated, so the batch chunk only
// ever loads after activation)

function wireVipStrip() {
  const catSel = $<HTMLSelectElement>("#vip-cat");
  const prog = $("#vip-prog");
  const buildBtn = $<HTMLButtonElement>("#vip-build");
  if (!catSel || !buildBtn) return;

  function fillCats(): void {
    const current = catSel.value || "all";
    const all = el("option", { value: "all", textContent: t("home.vipAll", { n: CATALOG.length }) });
    const opts = [all, ...CATEGORIES.map((c) => el("option", { value: c.id, textContent: `${catLabel(c.id)} (${CATALOG.filter((f) => f.cat === c.id).length})` }))];
    catSel.replaceChildren(...opts);
    catSel.value = [...catSel.options].some((o) => o.value === current) ? current : "all";
  }
  fillCats();

  let busy = false;
  buildBtn.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    buildBtn.disabled = true;
    void (async () => {
      try {
        const { buildBatchZip } = await import("./vip/batch");
        const zip = await buildBatchZip({
          cat: catSel.value || "all",
          sfx: $<HTMLInputElement>("#vip-sfx").checked,
          engine: ($<HTMLSelectElement>("#vip-engine").value || "none") as "none" | "godot" | "phaser",
          onProgress: (done, total, name) => {
            prog.textContent = name ? t("home.vipProgress", { done, total, name: fxName(findFxLoose(name) ?? { id: name, name }) }) : t("home.vipZipping", { total });
          },
        });
        const mb = (zip.size / 1048576).toFixed(1);
        const label = catSel.value === "all" ? t("home.vipAllName") : catLabel(catSel.value);
        download(zip, `pixjuice-vip-${catSel.value}.zip`);
        prog.textContent = t("home.vipDone", { cat: label, mb });
      } catch (err) {
        console.error(err);
        prog.textContent = t("home.vipFail", { msg: err instanceof Error ? err.message : String(err) });
      } finally {
        busy = false;
        buildBtn.disabled = false;
      }
    })();
  });

  onLocaleChange(fillCats);
}

function findFxLoose(id: string): CatalogEntry | undefined {
  return CATALOG.find((f) => f.id === id);
}

// ---- one clock for every live tile

function run() {
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const t of tiles) if (t.visible && t.player) t.player.tick(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

build();
chips();
wireSearch();
wireVipStrip();
void vipInit();
const hash = location.hash.replace("#", "");
if (hash && sections.some((s) => s.id === hash)) setCat(hash, true);
else setCat("all", true);
filter();
run();

// ---- i18n: static chrome now, dynamic bits re-render on switch (no reload — ?fx survives)

applyStaticText();
mountLangSwitcher();
if (getLocale() !== "en") document.title = t("title.home");
onLocaleChange(() => {
  document.title = t("title.home");
  for (const s of sections) {
    s.head.textContent = catLabel(s.id);
    s.blurb.textContent = t(`blurb.${s.id}`);
  }
  for (const tile of tiles) {
    tile.nameEl.textContent = fxName(tile.fx);
    tile.lenEl.textContent = tileLen(tile.fx);
    (tile.fig.querySelector("canvas") as HTMLCanvasElement).setAttribute("aria-label", fxName(tile.fx));
  }
  for (const c of chipLabels) c.node.textContent = c.id === "all" ? t("home.all") : catLabel(c.id);
  syncCatToggle();
  filter();
});
