/* PixJuice save/load template — core engine (vanilla, zero deps, DOM-free).
   Ships inside the downloadable ZIP as js/save-core.js (classic script) and is
   side-effect imported by the site demo, so site and ZIP run the same tested
   code. Exposes one global: PixSave.

   Design
   ------
   - Slots are addressed by id ("s1".."sN", "auto" for the autosave slot).
   - Storage is an injectable adapter ({ getItem, setItem, removeItem }) so the
     same code runs on localStorage (browser), memory (tests) or anything else.
   - A save entry is plain JSON: { v, slot, name, chapter, level, gold, x, y,
     playtime, ts, thumb?, auto? } — the shape the demo game fills in; swap in
     your own state object and keep the wrapper fields.
   - Export/import are validated text round-trips for the JSON-file feature. */

(function (root) {
  "use strict";

  var VERSION = 1;

  /** Memory adapter — handy for tests and for private-mode fallbacks. */
  function memoryAdapter() {
    var map = Object.create(null);
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
      setItem: function (k, v) { map[k] = String(v); },
      removeItem: function (k) { delete map[k]; },
    };
  }

  /** Fresh demo game state. Replace the body with your own state shape. */
  function newGame(slotId) {
    return {
      v: VERSION,
      slot: slotId || null,
      name: "Hero",
      chapter: 1,
      level: 1,
      gold: 0,
      x: 4,
      y: 3,
      playtime: 0,
      ts: 0,
      thumb: null,
      auto: false,
    };
  }

  function key(ns, slotId) {
    return ns + ":" + slotId;
  }

  /** Write an entry (ts stamped here). Returns the entry. */
  function write(adapter, ns, entry) {
    var next = Object.assign({}, entry, { v: VERSION, ts: Date.now() });
    adapter.setItem(key(ns, next.slot), JSON.stringify(next));
    return next;
  }

  /** Read one slot; null when empty or corrupt. */
  function read(adapter, ns, slotId) {
    var raw = null;
    try {
      raw = adapter.getItem(key(ns, slotId));
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    try {
      var parsed = sanitize(JSON.parse(raw));
      return parsed ? Object.assign(parsed, { slot: slotId }) : null;
    } catch (e) {
      return null;
    }
  }

  /** Read many slots at once → { slotId: entry|null }. */
  function list(adapter, ns, slotIds) {
    var out = Object.create(null);
    for (var i = 0; i < slotIds.length; i++) out[slotIds[i]] = read(adapter, ns, slotIds[i]);
    return out;
  }

  function remove(adapter, ns, slotId) {
    adapter.removeItem(key(ns, slotId));
  }

  /** Defensive field check for anything coming off disk, storage or an import. */
  function sanitize(e) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return null;
    var r = /** @type {Record<string, any>} */ (e);
    if (r.v !== VERSION || typeof r.name !== "string" || !Number.isFinite(Number(r.chapter)) || !Number.isFinite(Number(r.playtime))) return null;
    var num = function (v, dflt) {
      v = Number(v);
      return isFinite(v) ? v : dflt;
    };
    return {
      v: VERSION,
      slot: typeof r.slot === "string" ? r.slot : null,
      name: typeof r.name === "string" && r.name ? String(r.name).slice(0, 40) : "Hero",
      chapter: Math.max(1, Math.round(num(r.chapter, 1))),
      level: Math.max(1, Math.round(num(r.level, 1))),
      gold: Math.max(0, Math.round(num(r.gold, 0))),
      x: Math.max(0, Math.min(8, Math.round(num(r.x, 4)))),
      y: Math.max(0, Math.min(5, Math.round(num(r.y, 3)))),
      playtime: Math.max(0, Math.round(num(r.playtime, 0))),
      ts: Math.max(0, Math.round(num(r.ts, 0))) || 0,
      thumb: typeof r.thumb === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.thumb) && r.thumb.length < 200000 ? r.thumb : null,
      auto: r.auto === true,
    };
  }

  /** Export: pretty JSON text for a file download. */
  function exportText(entry) {
    var clean = sanitize(entry);
    if (!clean) throw new Error("not a valid save entry");
    return JSON.stringify(clean, null, 2);
  }

  /** Import: parse + validate pasted/file text → { ok, entry } | { ok:false, error }. */
  function parseImport(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: "not valid JSON" };
    }
    var clean = sanitize(parsed);
    if (!clean) return { ok: false, error: "not a PixJuice save (wrong shape or version)" };
    return { ok: true, entry: clean };
  }

  /** "5437" → "1h 30m", "42" → "42s" */
  function formatPlaytime(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + "s";
    var m = Math.floor(sec / 60);
    if (m < 60) return m + "m " + (sec % 60) + "s";
    var h = Math.floor(m / 60);
    return h + "h " + (m % 60) + "m";
  }

  var PixSave = {
    VERSION: VERSION,
    AUTO_ID: "auto",
    memoryAdapter: memoryAdapter,
    newGame: newGame,
    write: write,
    read: read,
    list: list,
    remove: remove,
    sanitize: sanitize,
    exportText: exportText,
    parseImport: parseImport,
    formatPlaytime: formatPlaytime,
  };

  root.PixSave = PixSave;
})(typeof window !== "undefined" ? window : globalThis);
