/* PixJuice gacha template — core rules engine (vanilla, zero deps, DOM-free).
   Ships inside the downloadable ZIP as js/gacha-core.js (classic script), and is
   imported as a side-effect module by the site demo, so the site and the ZIP run
   the exact same tested code. Exposes one global: PixGacha.

   Model
   -----
   - Card pool: 4 rarities (N/R/SR/SSR) with configurable base rates. One item is
     drawn per pull: first the rarity (weighted by rates), then an item of that
     rarity (weighted by its `weight`, default 1).
   - SSR pity: a hard guarantee — if `pity.ssr` pulls pass without an SSR, the
     next pull is forced to SSR. `sinceSsr` counts pulls since the last SSR.
   - Multi guarantee: every 10-pull contains at least one SR or better; if none
     has landed by the last slot, that slot is forced to SR (configurable via
     `pity.sr`, the multi-batch length this applies to).
   - Lucky wheel: separate prize game. Segments are the configured items, each
     weighted by its `weight` (default 1); the wheel picks one entry by weight
     and the UI animates to the matching segment. */

(function (root) {
  "use strict";

  var RARITIES = ["N", "R", "SR", "SSR"];

  var DEFAULT_CONFIG = {
    currency: { name: "Gems", single: 100, multi: 1000 },
    rates: { N: 0.79, R: 0.15, SR: 0.05, SSR: 0.01 },
    pity: { ssr: 90, sr: 10 },
    items: [
      { id: "wooden-sword", name: "Wooden Sword", rarity: "N" },
      { id: "health-potion", name: "Health Potion", rarity: "N" },
      { id: "copper-coin", name: "Copper Coin", rarity: "N" },
      { id: "cloth-scrap", name: "Cloth Scrap", rarity: "N" },
      { id: "steel-blade", name: "Steel Blade", rarity: "R" },
      { id: "travelers-charm", name: "Traveler's Charm", rarity: "R" },
      { id: "enchanted-grimoire", name: "Enchanted Grimoire", rarity: "SR" },
      { id: "excalibur", name: "Dawn Relic", rarity: "SSR" },
    ],
  };

  /** Validate + normalize a raw config (from JSON). Returns { ok:true, config } or
   *  { ok:false, error }. Rates are normalized to sum to 1; every rarity must keep
   *  at least one item; ids must be unique; numbers are clamped to sane ranges. */
  function validateConfig(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return { ok: false, error: "config must be an object" };
    var r = /** @type {Record<string, any>} */ (raw);

    var rates = { N: DEFAULT_CONFIG.rates.N, R: 0, SR: 0, SSR: 0 };
    rates.R = DEFAULT_CONFIG.rates.R;
    rates.SR = DEFAULT_CONFIG.rates.SR;
    rates.SSR = DEFAULT_CONFIG.rates.SSR;
    if (r.rates && typeof r.rates === "object") {
      for (var ri = 0; ri < RARITIES.length; ri++) {
        var k = RARITIES[ri];
        var v = Number(r.rates[k]);
        if (isFinite(v) && v >= 0) rates[k] = v;
      }
      var sum = rates.N + rates.R + rates.SR + rates.SSR;
      if (!(sum > 0)) return { ok: false, error: "rates must sum to a positive number" };
      rates.N /= sum;
      rates.R /= sum;
      rates.SR /= sum;
      rates.SSR /= sum;
    }

    var pity = { ssr: 90, sr: 10 };
    if (r.pity && typeof r.pity === "object") {
      var pssr = Math.round(Number(r.pity.ssr));
      if (isFinite(pssr) && pssr >= 1) pity.ssr = Math.min(pssr, 1000);
      var psr = Math.round(Number(r.pity.sr));
      if (isFinite(psr) && psr >= 2) pity.sr = Math.min(psr, 100);
    }
    if (pity.sr > pity.ssr) pity.sr = pity.ssr;

    if (r.items !== undefined && (!Array.isArray(r.items) || !r.items.length)) return {ok:false,error:"items list is empty"};
    var rawItems = r.items || DEFAULT_CONFIG.items;
    var items = [];
    var seen = Object.create(null);
    for (var i = 0; i < rawItems.length; i++) {
      var it = rawItems[i];
      if (!it || typeof it !== "object") continue;
      var id = typeof it.id === "string" && it.id ? it.id.slice(0, 40) : null;
      var name = typeof it.name === "string" && it.name ? it.name.slice(0, 60) : null;
      if (RARITIES.indexOf(it.rarity) === -1) return {ok:false,error:"invalid rarity"};
      var rarity = it.rarity;
      if (!id || !name || seen[id]) return {ok:false,error:"missing or duplicate item id/name"};
      seen[id] = true;
      var w = Number(it.weight);
      items.push({ id: id, name: name, rarity: rarity, weight: isFinite(w) && w > 0 ? w : 1 });
    }
    if (!items.length) return { ok: false, error: "items list is empty" };
    for (var rr = 0; rr < RARITIES.length; rr++)
      if (!items.some(function (it2) { return it2.rarity === RARITIES[rr]; }))
        return { ok: false, error: "no item with rarity " + RARITIES[rr] };

    var cur = r.currency && typeof r.currency === "object" ? r.currency : {};
    var cs = Math.round(Number(cur.single));
    var cm = Math.round(Number(cur.multi));
    var single = isFinite(cs) && cs >= 1 ? Math.min(cs, 1e9) : DEFAULT_CONFIG.currency.single;
    var multi = isFinite(cm) && cm >= 1 ? Math.min(cm, 1e9) : single * 10;

    return {
      ok: true,
      config: {
        currency: { name: typeof cur.name === "string" && cur.name ? cur.name.slice(0, 20) : "Gems", single: single, multi: multi },
        rates: rates,
        pity: pity,
        items: items,
      },
    };
  }

  /** Weighted pick. `weightOf(entry)` must return a positive finite number. */
  function pickWeighted(entries, weightOf, rng) {
    var total = 0;
    for (var i = 0; i < entries.length; i++) total += weightOf(entries[i]);
    var x = (rng ? rng() : Math.random()) * total;
    for (var j = 0; j < entries.length; j++) {
      x -= weightOf(entries[j]);
      if (x < 0) return entries[j];
    }
    return entries[entries.length - 1];
  }

  /** Pity counters: pulls since last SSR, pulls since last SR-or-better. */
  function makeState(sinceSsr, sinceSr) {
    return { sinceSsr: sinceSsr | 0, sinceSr: sinceSr | 0 };
  }

  /**
   * One pull. Returns { item, state }.
   * @param opts { forceSrPlus?: boolean } — used by pull() for the multi guarantee.
   */
  function rollOnce(config, state, rng, opts) {
    var forced = null;
    if (state.sinceSsr + 1 >= config.pity.ssr) forced = "SSR";
    else if (opts && opts.forceSrPlus) forced = "SR";

    var rarity = forced || pickWeighted(RARITIES, function (k) { return config.rates[k]; }, rng);

    var pool = config.items.filter(function (it) { return it.rarity === rarity; });
    var item = pool.length === 1
      ? pool[0]
      : pickWeighted(pool, function (it) { return it.weight || 1; }, rng);

    return {
      item: item,
      state: {
        sinceSsr: rarity === "SSR" ? 0 : state.sinceSsr + 1,
        sinceSr: rarity === "SR" || rarity === "SSR" ? 0 : state.sinceSr + 1,
      },
    };
  }

  /**
   * `times` pulls with pity carried across the batch. When `times` >= pity.sr the
   * last slot is forced to SR-or-better if the batch has none yet (the classic
   * "ten-pull guarantee").
   */
  function pull(config, state, times, rng) {
    if (!config.items.length || !Number.isInteger(times) || times < 1 || times > 100) throw new Error("invalid pool or pull count");
    var results = [];
    var s = { sinceSsr: state.sinceSsr | 0, sinceSr: state.sinceSr | 0 };
    for (var i = 0; i < times; i++) {
      var isLast = i === times - 1;
      var noSrYet = !results.some(function (r) { return r.rarity === "SR" || r.rarity === "SSR"; });
      var out = rollOnce(config, s, rng, { forceSrPlus: isLast && times > 1 && times >= config.pity.sr && noSrYet });
      results.push(out.item);
      s = out.state;
    }
    return { results: results, state: s };
  }

  /** Probability of one specific item (for the disclosure panel). */
  function itemOdds(config, item) {
    var same = config.items.filter(function (it) { return it.rarity === item.rarity; });
    var total = 0;
    for (var i = 0; i < same.length; i++) total += same[i].weight || 1;
    return config.rates[item.rarity] * ((item.weight || 1) / total);
  }

  /** Wheel entries: one per item with weight-derived odds. */
  function wheelSegments(config) {
    var total = 0;
    for (var i = 0; i < config.items.length; i++) total += config.items[i].weight || 1;
    return config.items.map(function (it) {
      return { item: it, odds: (it.weight || 1) / total };
    });
  }

  /** Winning entry index for a wheel spin (uniform over weight, not angle). */
  function wheelPick(config, rng) {
    var idx = -1;
    var pick = pickWeighted(config.items, function (it) { return it.weight || 1; }, rng);
    for (var i = 0; i < config.items.length; i++)
      if (config.items[i] === pick) { idx = i; break; }
    return idx;
  }

  /** Trim a history list to `limit` most-recent entries. */
  function record(history, items, at, limit) {
    var next = history.concat(items.map(function (it) { return { at: at, item: it }; }));
    return next.length > limit ? next.slice(next.length - limit) : next;
  }

  var PixGacha = {
    RARITIES: RARITIES,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    HISTORY_LIMIT: 50,
    validateConfig: validateConfig,
    pickWeighted: pickWeighted,
    makeState: makeState,
    rollOnce: rollOnce,
    pull: pull,
    itemOdds: itemOdds,
    wheelSegments: wheelSegments,
    wheelPick: wheelPick,
    record: record,
  };

  root.PixGacha = PixGacha;
})(typeof window !== "undefined" ? window : globalThis);
