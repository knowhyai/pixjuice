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
     and the UI animates to the matching segment.
   - Rate lab: `itemOdds` / `rates` are the advertised (no-pity) figures.
     `hardPityEffectiveRate` is the closed-form effective SSR rate for single
     pulls with a hard ceiling. `simulate` runs the same `rollOnce`/`pull`
     rules for many draws so a designer can compare advertised vs observed. */

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
      // 0 disables the SSR hard pity. The ten-pull SR guarantee is independent.
      if (isFinite(pssr) && pssr >= 0) pity.ssr = Math.min(pssr, 1000);
      var psr = Math.round(Number(r.pity.sr));
      if (isFinite(psr) && psr >= 2) pity.sr = Math.min(psr, 100);
    }
    // Keep the SR+ window inside an enabled SSR ceiling — except a ceiling of 1,
    // where every pull is already forced SSR; clamping sr to 1 there would make
    // ten-pull batches degenerate and simulate(mode:"ten") invalid.
    if (pity.ssr >= 2 && pity.sr > pity.ssr) pity.sr = pity.ssr;

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
    if (config.pity.ssr >= 1 && state.sinceSsr + 1 >= config.pity.ssr) forced = "SSR";
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

  /**
   * Effective SSR rate for single pulls with a hard ceiling: each pull has
   * base probability `p` until pull `n`, which is forced SSR. Equals
   * p / (1 - (1-p)^n). This does not model the ten-pull SR guarantee.
   */
  function hardPityEffectiveRate(p, n) {
    p = Number(p);
    n = Math.round(Number(n));
    if (!isFinite(p) || p < 0) return 0;
    if (p >= 1) return 1;
    // n < 1 means hard pity is disabled: the effective rate is the base rate.
    if (!isFinite(n) || n < 1) return p;
    // p = 0 still hits the hard ceiling, so the long-run rate is 1/n.
    if (p === 0) return 1 / n;
    // expm1/log1p keep the denominator exact when p is so small that
    // 1 - (1-p)^n would round to 0 and falsely report a 100% effective rate.
    var denom = -Math.expm1(n * Math.log1p(-p));
    if (!(denom > 0)) return 1;
    return p / denom;
  }

  var SIM_MAX_PULLS = 500000;

  /**
   * Run many pulls with the live template rules.
   * opts.mode "single" — one pull at a time (SSR hard pity only).
   * opts.mode "ten" — batches of `config.pity.sr` (includes the SR+ guarantee).
   * Remainder pulls in "ten" mode are singles. Does not mutate `config`.
   * Returns advertised (no-pity) rates, observed frequencies, force counts,
   * and, for single mode, the closed-form expected SSR rate.
   */
  function simulate(config, opts) {
    opts = opts || {};
    var pulls = Math.round(Number(opts.pulls));
    if (!isFinite(pulls) || pulls < 1) throw new Error("invalid pull count");
    var max = opts.maxPulls != null ? Math.round(Number(opts.maxPulls)) : SIM_MAX_PULLS;
    if (!isFinite(max) || max < 1) throw new Error("invalid max pull count");
    if (pulls > max) throw new Error("pull count exceeds " + max);
    var mode = opts.mode === "ten" ? "ten" : "single";
    var rng = opts.rng;
    var state = makeState();
    var counts = { N: 0, R: 0, SR: 0, SSR: 0 };
    var itemCounts = Object.create(null);
    var forcedSsr = 0;
    var forcedSr = 0;
    var firstSsrAt = null;
    var total = 0;

    function take(item, wasForcedSsr, wasForcedSr) {
      counts[item.rarity]++;
      itemCounts[item.id] = (itemCounts[item.id] || 0) + 1;
      total++;
      if (wasForcedSsr) forcedSsr++;
      if (wasForcedSr) forcedSr++;
      if (item.rarity === "SSR" && firstSsrAt == null) firstSsrAt = total;
    }

    function runBatch(times) {
      var results = [];
      for (var i = 0; i < times; i++) {
        var isLast = i === times - 1;
        var noSrYet = !results.some(function (r) { return r.rarity === "SR" || r.rarity === "SSR"; });
        var forceSsr = config.pity.ssr >= 1 && state.sinceSsr + 1 >= config.pity.ssr;
        var forceSrPlus = isLast && times > 1 && times >= config.pity.sr && noSrYet;
        var out = rollOnce(config, state, rng, { forceSrPlus: forceSrPlus });
        state = out.state;
        take(out.item, forceSsr, forceSrPlus && !forceSsr);
        results.push(out.item);
      }
    }

    if (mode === "single") {
      for (var s = 0; s < pulls; s++) runBatch(1);
    } else {
      var batch = config.pity.sr;
      if (!(batch >= 2)) throw new Error("invalid ten-pull length");
      var batches = Math.floor(pulls / batch);
      var rem = pulls - batches * batch;
      for (var b = 0; b < batches; b++) runBatch(batch);
      if (rem) runBatch(rem);
    }

    var advertised = { N: config.rates.N, R: config.rates.R, SR: config.rates.SR, SSR: config.rates.SSR };
    var observed = {
      N: counts.N / total,
      R: counts.R / total,
      SR: counts.SR / total,
      SSR: counts.SSR / total,
    };
    return {
      pulls: total,
      mode: mode,
      advertised: advertised,
      observed: observed,
      expectedSsrHardPity: mode === "single" && config.pity.ssr >= 1
        ? hardPityEffectiveRate(config.rates.SSR, config.pity.ssr)
        : null,
      counts: counts,
      forcedSsr: forcedSsr,
      forcedSr: forcedSr,
      firstSsrAt: firstSsrAt,
      itemCounts: itemCounts,
      pity: { ssr: config.pity.ssr, sr: config.pity.sr },
    };
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
    hardPityEffectiveRate: hardPityEffectiveRate,
    SIM_MAX_PULLS: SIM_MAX_PULLS,
    simulate: simulate,
    wheelSegments: wheelSegments,
    wheelPick: wheelPick,
    record: record,
  };

  root.PixGacha = PixGacha;
})(typeof window !== "undefined" ? window : globalThis);
