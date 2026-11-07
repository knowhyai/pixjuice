// The catalog: every effect playing live from its own code. Tiles start when they scroll into
// view; clicking one opens the editor with that effect.

import "./style.css";
import { actBounds } from "pixelfx";
import { CATALOG, CATEGORIES, isScreen, type CatalogEntry } from "./lib/catalog";
import { Player, defaultStyle } from "./lib/player";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  player: Player | null;
  visible: boolean;
}

const tiles: Tile[] = [];
const sections: { id: string; sec: HTMLElement; list: CatalogEntry[] }[] = [];

function build() {
  const main = $("#grid");
  for (const c of CATEGORIES) {
    const list = CATALOG.filter((f) => f.cat === c.id);
    if (!list.length) continue;
    const grid = el("div", { className: "grid" });
    const sec = el("section", { className: "cat", id: `cat-${c.id}` }, [
      el("div", { className: "sec-head" }, [
        el("h2", { textContent: c.name }),
        el("p", { className: "blurb", textContent: c.blurb }),
      ]),
      grid,
    ]);
    sections.push({ id: c.id, sec, list });
    for (const fx of list) {
      const cv = el("canvas", { ariaLabel: fx.name });
      const act = fx.mod.act;
      const b = act ? actBounds(fx.mod) : null;
      const [fw, fh] = b ? [b.x1 - b.x0, b.y1 - b.y0] : fx.meta.size;
      const big = fw > 200 || fh > 170 || (b && (fw > 130 || !!(act?.target || act?.targets)));
      const cls = isScreen(fx.meta) ? "tile screen" : big ? "tile big" : "tile";
      const fig = el("figure", { className: cls, tabIndex: 0 }, [
        el("div", { className: "stage" }, [cv]),
        el("figcaption", {}, [
          el("b", { textContent: fx.name }),
          el("small", { textContent: fx.meta.loop ? "loop" : `${+fx.meta.duration.toFixed(2)}s` }),
        ]),
      ]);
      const t: Tile = { fx, fig, player: null, visible: false };
      const go = () => (location.href = `editor/?fx=${encodeURIComponent(fx.id)}`);
      fig.addEventListener("click", go);
      fig.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
      grid.append(fig);
      tiles.push(t);
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

function chips() {
  const box = $("#chips");
  const mk = (id: string, label: string, n: number) => {
    const b = el("button", { className: "chip", type: "button" }, [
      label,
      el("span", { textContent: String(n) }),
    ]);
    b.dataset.cat = id;
    b.addEventListener("click", () => setCat(id));
    box.append(b);
  };
  mk("all", "all", CATALOG.length);
  for (const s of sections) mk(s.id, CATEGORIES.find((c) => c.id === s.id)?.name ?? s.id, s.list.length);
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
        (!q || [fx.id, fx.name, fx.meta.desc ?? "", ...(fx.meta.tags ?? [])].join(" ").toLowerCase().includes(q));
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
