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
   - Multi guarantee: pity.sr is the minimum batch size for an SR+ guarantee.
     The demo and rate lab use fixed batches of ten. In a qualifying batch,
     the last slot is forced to SR if none was drawn and SSR pity does not apply.
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
  var MULTI_PULLS = 10;

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

    var rates = { ...DEFAULT_CONFIG.rates };
    if (r.rates !== undefined) {
      if (!r.rates || typeof r.rates !== "object" || Array.isArray(r.rates))
        return { ok: false, error: "rates must be an object" };
      try {
        var odds = weightTable(RARITIES, function (rarity) {
          return r.rates[rarity] === undefined ? DEFAULT_CONFIG.rates[rarity] : r.rates[rarity];
        });
        RARITIES.forEach(function (rarity, i) {
          rates[rarity] = odds.weights[i] / odds.total;
        });
      } catch (e) {
        return { ok: false, error: "rates must be finite, non-negative numbers with a positive sum" };
      }
    }

    var pity = { ssr: 90, sr: 10 };
    if (r.pity && typeof r.pity === "object") {
      var pssr = Math.round(Number(r.pity.ssr));
      // 0 disables the SSR ceiling. The minimum batch size is independent.
      if (isFinite(pssr) && pssr >= 0) pity.ssr = Math.min(pssr, 1000);
      var psr = Math.round(Number(r.pity.sr));
      if (isFinite(psr) && psr >= 2) pity.sr = Math.min(psr, 100);
    }
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
      var w = it.weight === undefined ? 1 : it.weight;
      if (!Number.isFinite(w) || w <= 0) return { ok: false, error: "item weights must be positive finite numbers" };
      items.push({ id: id, name: name, rarity: rarity, weight: w });
    }
    if (!items.length) return { ok: false, error: "items list is empty" };
    for (var rr = 0; rr < RARITIES.length; rr++)
      if (!items.some(function (it2) { return it2.rarity === RARITIES[rr]; }))
        return { ok: false, error: "no item with rarity " + RARITIES[rr] };

    var cur = r.currency && typeof r.currency === "object" ? r.currency : {};
    var cs = Math.round(Number(cur.single));
    var cm = Math.round(Number(cur.multi));
    var single = isFinite(cs) && cs >= 1 ? Math.min(cs, 1e9) : DEFAULT_CONFIG.currency.single;
    var multi = isFinite(cm) && cm >= 1 ? Math.min(cm, 1e9) : single * MULTI_PULLS;

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

  function weightTable(entries, weightOf) {
    var weights = [];
    var max = 0;
    var total = 0;
    for (var i = 0; i < entries.length; i++) {
      var weight = weightOf(entries[i]);
      if (!Number.isFinite(weight) || weight < 0) throw new Error("invalid weight");
      weights.push(weight);
      max = Math.max(max, weight);
      total += weight;
    }
    if (max === 0) throw new Error("weights must have positive mass");
    // Preserve ordinary values exactly; scale only when the finite terms overflow.
    if (!Number.isFinite(total)) {
      weights = weights.map(function (weight) { return weight / max; });
      total = weights.reduce(function (sum, weight) { return sum + weight; }, 0);
    }
    return { weights: weights, total: total };
  }

  function weightedPool(entries, weightOf) {
    var table = weightTable(entries, weightOf);
    var cumulative = [];
    var total = 0;
    var lastPositive = -1;
    for (var i = 0; i < table.weights.length; i++) {
      var next = total + table.weights[i];
      if (next > total) lastPositive = i;
      cumulative.push(next);
      total = next;
    }
    return { entries: entries, cumulative: cumulative, total: total, lastPositive: lastPositive };
  }

  function pickFromPool(pool, rng) {
    var random = (rng || Math.random)();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error("invalid random draw");
    var x = random * pool.total;
    var start = 0;
    var end = pool.cumulative.length;
    while (start < end) {
      var middle = (start + end) >>> 1;
      if (x < pool.cumulative[middle]) end = middle;
      else start = middle + 1;
    }
    // A draw rounded to the upper boundary still belongs to a positive-weight entry.
    return pool.entries[start === pool.entries.length ? pool.lastPositive : start];
  }

  /** Weighted pick. Rejects invalid weights and tables with no positive mass. */
  function pickWeighted(entries, weightOf, rng) {
    return pickFromPool(weightedPool(entries, weightOf), rng);
  }

  function itemWeight(item) {
    return item.weight === undefined ? 1 : item.weight;
  }

  /** Pity counters: pulls since last SSR, pulls since last SR-or-better. */
  function makeState(sinceSsr, sinceSr) {
    return { sinceSsr: sinceSsr | 0, sinceSr: sinceSr | 0 };
  }

  function shouldForceSsr(config, state) {
    return config.pity.ssr >= 1 && state.sinceSsr + 1 >= config.pity.ssr;
  }

  function prepareDraws(config) {
    var items = { N: [], R: [], SR: [], SSR: [] };
    config.items.forEach(function (item) { items[item.rarity].push(item); });
    var pools = {};
    RARITIES.forEach(function (rarity) { pools[rarity] = weightedPool(items[rarity], itemWeight); });
    return {
      rarities: weightedPool(RARITIES, function (rarity) { return config.rates[rarity]; }),
      pools: pools,
    };
  }

  /** One pull. forceSrPlus is used by the shared batch runner. */
  function rollOnce(config, state, rng, opts) {
    return drawCard(prepareDraws(config), state, rng,
      shouldForceSsr(config, state) ? "SSR" : opts && opts.forceSrPlus ? "SR" : null);
  }

  function drawCard(draws, state, rng, forced) {
    var rarity = forced || pickFromPool(draws.rarities, rng);
    var pool = draws.pools[rarity];
    var item = pool.entries.length === 1 ? pool.entries[0] : pickFromPool(pool, rng);
    return {
      item: item,
      state: {
        sinceSsr: rarity === "SSR" ? 0 : state.sinceSsr + 1,
        sinceSr: rarity === "SR" || rarity === "SSR" ? 0 : state.sinceSr + 1,
      },
    };
  }

  function runBatch(config, draws, state, times, rng, take) {
    var gotSrPlus = false;
    for (var i = 0; i < times; i++) {
      var forceSrPlus = i === times - 1 && times >= config.pity.sr && !gotSrPlus;
      var forceSsr = shouldForceSsr(config, state);
      var out = drawCard(draws, state, rng, forceSsr ? "SSR" : forceSrPlus ? "SR" : null);
      take(out.item, forceSsr, forceSrPlus && !forceSsr);
      gotSrPlus = gotSrPlus || out.item.rarity === "SR" || out.item.rarity === "SSR";
      state = out.state;
    }
    return state;
  }

  /** Carry pity across a batch. Batches at least as large as pity.sr guarantee SR+. */
  function pull(config, state, times, rng) {
    if (!config.items.length || !Number.isInteger(times) || times < 1 || times > 100) throw new Error("invalid pool or pull count");
    var results = [];
    var next = runBatch(config, prepareDraws(config), makeState(state.sinceSsr, state.sinceSr), times, rng, function (item) {
      results.push(item);
    });
    return { results: results, state: next };
  }

  /** Probability of one specific item (for the disclosure panel). */
  function itemOdds(config, item) {
    var same = config.items.filter(function (it) { return it.rarity === item.rarity; });
    var table = weightTable(same, itemWeight);
    var index = same.findIndex(function (it) { return it.id === item.id; });
    return index === -1 ? 0 : config.rates[item.rarity] * (table.weights[index] / table.total);
  }

  /** Wheel entries: one per item with weight-derived odds. */
  function wheelSegments(config) {
    var table = weightTable(config.items, itemWeight);
    return config.items.map(function (it, i) {
      return { item: it, odds: table.weights[i] / table.total };
    });
  }

  /** Winning entry index for a wheel spin (uniform over weight, not angle). */
  function wheelPick(config, rng) {
    var idx = -1;
    var pick = pickWeighted(config.items, itemWeight, rng);
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
   * opts.mode "ten" — fixed batches of ten, using the same SR+ threshold as the live button.
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

    var batch = mode === "ten" ? MULTI_PULLS : 1;
    var draws = prepareDraws(config);
    var remaining = pulls;
    while (remaining >= batch) {
      state = runBatch(config, draws, state, batch, rng, take);
      remaining -= batch;
    }
    // The leftover pulls represent individual transactions, not a smaller multi.
    while (remaining-- > 0) state = runBatch(config, draws, state, 1, rng, take);

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
    MULTI_PULLS: MULTI_PULLS,
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
