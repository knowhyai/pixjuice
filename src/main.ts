// The catalog: every effect playing live from its own code. Tiles start when they scroll into
// view; clicking one opens the editor with that effect.

import "./style.css";
import { CATALOG, CATEGORIES, isScreen, type CatalogEntry } from "./lib/catalog";
import { Player, defaultStyle } from "./lib/player";
import { applyStaticText, fxDesc, fxName, getLocale, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";
import { mountToolsMenu } from "./lib/navmenu";

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
      const cv = el("canvas", { ariaLabel: fx.name, width: 160, height: 100 });
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

function setCat(id: string, fromHash = false) {
  state.cat = sections.some((s) => s.id === id) ? id : "all";
  document.querySelectorAll(".chip").forEach((b) =>
    b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.cat === state.cat)),
  );
  if (!fromHash)
    history.replaceState(null, "", state.cat === "all" ? location.pathname : `#${state.cat}`);
  filter();
  if (!fromHash) window.scrollTo({ top: 0 });
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
const hash = location.hash.replace("#", "");
if (hash && sections.some((s) => s.id === hash)) setCat(hash, true);
else setCat("all", true);
filter();
run();

// ---- i18n: static chrome now, dynamic bits re-render on switch (no reload — ?fx survives)

applyStaticText();
mountLangSwitcher();
mountToolsMenu();
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
  filter();
});
