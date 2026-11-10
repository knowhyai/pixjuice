/* PixJuice gacha template — demo UI (vanilla, zero deps).
   Ships in the ZIP as js/main.js (classic script) and is imported by the site
   demo page, which only adds localization + the source-code section on top.
   Builds the whole demo into #app; expects the globals PixGacha (js/gacha-core.js)
   and PixSkins (js/skins.js) to exist, and styles.css in scope.

   Dynamic labels carry data-i18n keys with English text as the default. A host
   page may define window.PixI18nRefresh() — it is called after dynamic inserts
   so the host can re-translate (the ZIP itself never does). */

(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis;
  var G = root.PixGacha;
  var S = root.PixSkins;
  var host = document.getElementById("app");
  if (!host || !G || !S) return;

  var reduced = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STORE_KEY = "pix-tpl-gacha";
  var ASSETS_BASE = location.protocol === "file:" ? "https://pixjuice.pages.dev/free-assets/chest-wood" : "/free-assets/chest-wood"; // library URL — the ZIP does not bundle art

  // ---- state -----------------------------------------------------------------

  var cfg = G.validateConfig(G.DEFAULT_CONFIG).config;
  var pity = G.makeState(0, 0);
  var history = [];
  var gems = 6000;
  var skin = "stylized";
  var busy = false;

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ cfg: cfg, pity: pity, history: history, gems: gems, skin: skin }));
    } catch (e) { /* private mode — session only */ }
  }
  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && typeof s === "object") {
        if (s.cfg) { var v = G.validateConfig(s.cfg); if (v.ok) cfg = v.config; }
        if (s.pity && typeof s.pity.sinceSsr === "number") pity = G.makeState(s.pity.sinceSsr, s.pity.sinceSr);
        if (Array.isArray(s.history)) history = s.history.slice(-G.HISTORY_LIMIT);
        if (typeof s.gems === "number") gems = s.gems;
        if (S.isSkin(s.skin)) skin = s.skin;
      }
    } catch (e) { /* corrupt storage — start fresh */ }
  }

  // ---- dom helper ------------------------------------------------------------

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "class") e.className = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else if (k === "html") e.innerHTML = attrs[k];
        else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (kids) for (var i = 0; i < kids.length; i++) e.appendChild(kids[i]);
    return e;
  }
  function lbl(key, text) {
    return h("span", { "data-i18n": key, text: text || defaultText(key) });
  }
  var EN = {
    "gx.tabPool": "Card pool", "gx.tabWheel": "Lucky wheel",
    "gx.pull1": "Pull ×1", "gx.pull10": "Pull ×10",
    "gx.pityGuarantee": "SSR guaranteed within {n} pulls",
    "gx.tenNote": "Every 10-pull includes at least one SR or better.",
    "gx.pityNow": "SSR pity: {n}/{max}",
    "gx.rates": "Drop rates", "gx.pool": "Prize pool", "gx.odds": "Odds",
    "gx.rarity": "Rarity", "gx.item": "Item", "gx.pulls": "Pulls",
    "gx.history": "Pull history", "gx.historyEmpty": "No pulls yet — try your luck!",
    "gx.clear": "Clear", "gx.spin": "SPIN", "gx.spinning": "Spinning…",
    "gx.won": "You got: {item}!", "gx.opening": "Opening…",
    "gx.settings": "Settings", "gx.skin": "Skin",
    "gx.ratesCfg": "Rates (N / R / SR / SSR)", "gx.pityCfg": "SSR pity (pulls)",
    "gx.loadCfg": "Load config.json", "gx.saveCfg": "Download config.json",
    "gx.reset": "Reset demo", "gx.cfgOk": "Config applied.",
    "gx.cfgBad": "Invalid config: {e}",
    "gx.noGems": "Out of gems — the demo currency is free, press Reset.",
    "gx.resetDone": "Demo reset.", "gx.rar.N": "Normal", "gx.rar.R": "Rare",
    "gx.rar.SR": "Epic", "gx.rar.SSR": "Legendary",
    "tpl.skin": "Skin", "tpl.skin.realistic": "Realistic", "tpl.skin.stylized": "Stylized",
    "tpl.skin.lowpoly": "Clean Low Poly", "tpl.skin.pixel": "Pixel Art",
    "gx.wheelNote": "Wheel odds = each prize's weight. Card-pool odds & pity live in the config JSON.",
  };
  function defaultText(key) {
    if (typeof root.PixTranslate === "function") return root.PixTranslate(key);
    return typeof EN[key] === "string" ? EN[key] : key.split(".").pop();
  }
  function refreshI18n() {
    if (typeof root.PixI18nRefresh === "function") root.PixI18nRefresh();
  }
  function say(key, vars) {
    var t = defaultText(key);
    if (vars) for (var k in vars) t = t.replace("{" + k + "}", String(vars[k]));
    var el = h("div", { class: "tpl-toast", role: "status", "data-i18n": key, "data-i18n-vars": JSON.stringify(vars || {}), text: t });
    demo.appendChild(el);
    refreshI18n();
    requestAnimationFrame(function () { el.classList.add("on"); });
    setTimeout(function () { el.classList.remove("on"); setTimeout(function () { el.remove(); }, 350); }, 2600);
  }

  // ---- layout ----------------------------------------------------------------

  host.innerHTML = "";
  var demo = h("div", { class: "tpl-demo", "data-skin": skin });
  var side = h("aside", { class: "tpl-side", "aria-label": "Settings" });
  var stage = h("section", { class: "tpl-stage" });
  var record = h("aside", { class: "tpl-record" });
  demo.appendChild(side);
  demo.appendChild(stage);
  demo.appendChild(record);
  host.appendChild(demo);

  // ---- side panel: skins + params ---------------------------------------------

  side.appendChild(h("h3", { text: "Settings", "data-i18n": "gx.settings" }));
  side.appendChild(h("h4", { text: "Skin", "data-i18n": "gx.skin" }));
  var skinRow = h("div", { class: "gx-skins", role: "group" });
  S.SKINS.forEach(function (s) {
    skinRow.appendChild(h("button", {
      class: "gx-skin-btn", type: "button", "data-skin-id": s, "data-i18n": S.SKIN_KEYS[s],
      text: defaultText(S.SKIN_KEYS[s]),
      onclick: function () { setSkin(s); },
    }));
  });
  side.appendChild(skinRow);

  side.appendChild(h("h4", { text: "Rates (N / R / SR / SSR)", "data-i18n": "gx.ratesCfg" }));
  var sliders = {};
  ["N", "R", "SR", "SSR"].forEach(function (r) {
    var row = h("label", { class: "gx-slider" });
    row.appendChild(h("b", { text: r }));
    var input = h("input", { type: "range", min: "0", max: "100", step: "0.5", "aria-label": "Rate " + r });
    var out = h("output", {});
    row.appendChild(input);
    row.appendChild(out);
    input.addEventListener("input", function () {
      setRates(r, Number(input.value) / 100);
    });
    sliders[r] = { input: input, out: out };
    side.appendChild(row);
  });

  var pityRow = h("label", { class: "gx-slider" });
  pityRow.appendChild(h("b", { text: "SSR pity", "data-i18n": "gx.pityCfg" }));
  var pityInput = h("input", { type: "number", min: "10", max: "500", step: "10", "aria-label": "SSR pity threshold" });
  pityRow.appendChild(pityInput);
  side.appendChild(pityRow);
  pityInput.addEventListener("change", function () {
    if (busy || spinning) return;
    var v = G.validateConfig({ rates: cfg.rates, pity: { ssr: Number(pityInput.value), sr: cfg.pity.sr }, items: cfg.items, currency: cfg.currency });
    if (v.ok) { cfg = v.config; syncPanel(); syncOdds(); syncPity(); drawWheel(null); persist(); }
  });

  var cfgRow = h("div", { class: "gx-btnrow" });
  var file = h("input", { type: "file", accept: ".json,application/json", class: "gx-file", "aria-label": "Load config.json" });
  file.addEventListener("change", function () {
    var f = file.files && file.files[0];
    if (!f || busy || spinning) return;
    var fr = new FileReader();
    fr.onload = function () {
      var v = G.validateConfig(safeParse(String(fr.result)));
      if (v.ok) { cfg = v.config; syncPanel(); syncOdds(); syncPity(); drawWheel(null); persist(); say("gx.cfgOk"); }
      else say("gx.cfgBad", { e: v.error });
    };
    fr.readAsText(f);
    file.value = "";
  });
  cfgRow.appendChild(file);
  cfgRow.appendChild(h("button", { class: "tpl-btn", type: "button", "data-i18n": "gx.loadCfg", text: "Load config.json", onclick: function () { file.click(); } }));
  cfgRow.appendChild(h("button", { class: "tpl-btn", type: "button", "data-i18n": "gx.saveCfg", text: "Download config.json", onclick: downloadConfig }));
  cfgRow.appendChild(h("button", { class: "tpl-btn tpl-btn-ghost", type: "button", "data-i18n": "gx.reset", text: "Reset demo", onclick: function () { if (!busy && !spinning) resetAll(); } }));
  side.appendChild(cfgRow);

  function safeParse(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }
  function setRates(changed, value) {
    if (busy || spinning) return;
    var rest = G.RARITIES.filter(function (r) { return r !== changed; });
    var restSum = 0;
    rest.forEach(function (r) { restSum += cfg.rates[r]; });
    var next = { N: cfg.rates.N, R: cfg.rates.R, SR: cfg.rates.SR, SSR: cfg.rates.SSR };
    next[changed] = value;
    var left = Math.max(0, 1 - value);
    rest.forEach(function (r) { next[r] = restSum > 0 ? (cfg.rates[r] / restSum) * left : left / rest.length; });
    var v = G.validateConfig({ rates: next, pity: cfg.pity, items: cfg.items, currency: cfg.currency });
    if (v.ok) { cfg = v.config; syncPanel(); syncOdds(); syncPity(); drawWheel(null); persist(); }
  }
  function syncPanel() {
    G.RARITIES.forEach(function (r) {
      sliders[r].input.value = String(Math.round(cfg.rates[r] * 2000) / 20);
      sliders[r].out.textContent = (cfg.rates[r] * 100).toFixed(1) + "%";
    });
    pityInput.value = String(cfg.pity.ssr);
  }
  function downloadConfig() {
    saveBlob(new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" }), "config.json");
  }
  function resetAll() {
    cfg = G.validateConfig(G.DEFAULT_CONFIG).config;
    pity = G.makeState(0, 0);
    history = [];
    gems = 6000;
    persist();
    syncPanel(); syncOdds(); syncWallet(); syncPity(); syncHistory(); drawIdle(); drawWheel(null);
    say("gx.resetDone");
  }

  // ---- stage: mode tabs --------------------------------------------------------

  var tabs = h("div", { class: "gx-tabs", role: "tablist" });
  var tabPool = h("button", { class: "gx-tab on", role: "tab", "aria-selected": "true", "data-i18n": "gx.tabPool", text: "Card pool", onclick: function () { mode("pool"); } });
  var tabWheel = h("button", { class: "gx-tab", role: "tab", "aria-selected": "false", "data-i18n": "gx.tabWheel", text: "Lucky wheel", onclick: function () { mode("wheel"); } });
  tabs.appendChild(tabPool);
  tabs.appendChild(tabWheel);
  stage.appendChild(tabs);

  var poolPane = h("div", { class: "gx-pane", role: "tabpanel" });
  var wheelPane = h("div", { class: "gx-pane", role: "tabpanel", hidden: "" });
  stage.appendChild(poolPane);
  stage.appendChild(wheelPane);

  function mode(m) {
    var pool = m === "pool";
    tabPool.classList.toggle("on", pool);
    tabWheel.classList.toggle("on", !pool);
    tabPool.setAttribute("aria-selected", pool ? "true" : "false");
    tabWheel.setAttribute("aria-selected", pool ? "false" : "true");
    poolPane.hidden = !pool;
    wheelPane.hidden = pool;
  }

  // ---- pool pane ---------------------------------------------------------------

  var wallet = h("div", { class: "gx-wallet" });
  var gemsEl = h("b", { text: String(gems) });
  wallet.appendChild(h("span", { class: "gx-gem", "aria-hidden": "true" }));
  wallet.appendChild(gemsEl);
  wallet.appendChild(lbl("gx.gemsLeft", "gems"));
  poolPane.appendChild(wallet);

  var chestWrap = h("div", { class: "gx-chest" });
  var chestCv = h("canvas", { width: "128", height: "128", "aria-hidden": "true" });
  chestWrap.appendChild(chestCv);
  var chestNote = h("p", { class: "gx-chest-note", "data-i18n": "gx.opening", text: "Opening…", hidden: "" });
  chestWrap.appendChild(chestNote);
  poolPane.appendChild(chestWrap);

  var pityBar = h("div", { class: "gx-pitybar" });
  var pityFill = h("i", {});
  var pityText = h("span", {});
  pityBar.appendChild(pityFill);
  pityBar.appendChild(pityText);
  poolPane.appendChild(pityBar);

  var btnRow = h("div", { class: "gx-btnrow" });
  var b1 = h("button", { class: "tpl-btn tpl-btn-big", type: "button", "data-i18n": "gx.pull1", text: "Pull ×1", onclick: function () { doPull(1); } });
  var b10 = h("button", { class: "tpl-btn tpl-btn-big tpl-btn-accent", type: "button", "data-i18n": "gx.pull10", text: "Pull ×10", onclick: function () { doPull(10); } });
  btnRow.appendChild(b1);
  btnRow.appendChild(b10);
  poolPane.appendChild(btnRow);
  poolPane.appendChild(h("p", { class: "gx-note", "data-i18n": "gx.tenNote", text: "Every 10-pull includes at least one SR or better." }));

  var results = h("div", { class: "gx-results", "aria-live": "polite" });
  poolPane.appendChild(results);

  function syncWallet() { gemsEl.textContent = String(gems); }
  function syncPity() {
    var max = cfg.pity.ssr;
    var n = Math.min(pity.sinceSsr, max);
    pityFill.style.width = (n / max) * 100 + "%";
    while (pityText.firstChild) pityText.removeChild(pityText.firstChild);
    pityText.appendChild(h("span", { "data-i18n": "gx.pityNow", "data-i18n-vars": JSON.stringify({n:n,max:max}), text: defaultText("gx.pityNow").replace("{n}", String(n)).replace("{max}", String(max)) }));

    refreshI18n();
  }

  function doPull(times) {
    if (busy || spinning) return;
    var price = times === 1 ? cfg.currency.single : cfg.currency.multi;
    if (gems < price) { say("gx.noGems"); return; }
    busy = true;
    gems -= price;
    syncWallet();

    var out = G.pull(cfg, pity, times);
    pity = out.state;
    results.innerHTML = "";
    var show = out.results;

    var finish = function () {
      history = G.record(history, show, Date.now(), G.HISTORY_LIMIT);
      syncPity(); syncHistory(); persist();
      var best = show.reduce(function (a, b) { return rank(b) > rank(a) ? b : a; }, show[0]);
      say("gx.won", { item: best.name });
      busy = false;
      renderCards(show);
    };

    if (times > 1 && !reduced) {
      chestNote.hidden = false;
      playChest(["open", "open_burst"], function () {
        chestNote.hidden = true;
        finish();
      });
    } else {
      finish();
    }
  }

  function rank(item) { return G.RARITIES.indexOf(item.rarity); }

  function renderCards(items) {
    items.forEach(function (it, i) {
      var card = h("div", { class: "gx-card r-" + it.rarity, style: "transition-delay:" + i * 70 + "ms" });
      var inner = h("div", { class: "gx-card-in" });
      var back = h("div", { class: "gx-face gx-back" });
      back.appendChild(h("span", { class: "gx-mark", "aria-hidden": "true", text: "?" }));
      var front = h("div", { class: "gx-face gx-front" });
      front.appendChild(h("b", { text: it.name }));
      front.appendChild(h("span", { text: it.rarity + " · " + defaultText("gx.rar." + it.rarity), "data-i18n": "gx.rar." + it.rarity }));
      inner.appendChild(back);
      inner.appendChild(front);
      card.appendChild(inner);
      results.appendChild(card);
      requestAnimationFrame(function () { requestAnimationFrame(function () { card.classList.add("flip"); }); });
    });
  }

  // ---- chest sprite animation (art from the PixJuice free asset library) -------

  var sheetCache = Object.create(null);
  function loadSheet(url, cb) {
    if (sheetCache[url]) return cb(sheetCache[url]);
    var img = new Image();
    img.onload = function () { sheetCache[url] = img; cb(img); };
    img.onerror = function () { cb(null); };
    img.src = url;
  }
  var FRAMES = 8, FRAME_MS = 80;
  function playChest(clips, done) {
    var base = S.chestSpriteBase(skin, ASSETS_BASE);
    var ctx = chestCv.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    chestCv.style.visibility = "visible";
    var queue = clips.slice();
    (function next() {
      if (!queue.length) return done();
      var clip = queue.shift();
      loadSheet(base + "/" + clip + ".png", function (img) {
        if (!img) return done(); // offline ZIP without the library art — skip gracefully
        var f = 0;
        var pixel = skin === "pixel-art";
        (function tick() {
          ctx.imageSmoothingEnabled = !pixel;
          ctx.clearRect(0, 0, 128, 128);
          ctx.drawImage(img, f * 128, 0, 128, 128, 0, 0, 128, 128);
          f++;
          if (f < FRAMES) setTimeout(tick, FRAME_MS);
          else setTimeout(next, clip === "open_burst" ? 60 : 0);
        })();
      });
    })();
  }
  // idle chest as the resting state
  function drawIdle() {
    var base = S.chestSpriteBase(skin, ASSETS_BASE);
    loadSheet(base + "/idle.png", function (img) {
      if (!img) return;
      var ctx = chestCv.getContext("2d");
      ctx.imageSmoothingEnabled = skin !== "pixel-art";
      ctx.clearRect(0, 0, 128, 128);
      ctx.drawImage(img, 0, 0, 128, 128, 0, 0, 128, 128);
    });
  }

  // ---- wheel pane ----------------------------------------------------------------

  var wheelWrap = h("div", { class: "gx-wheel-wrap" });
  var wheelCv = h("canvas", { width: "340", height: "340", "aria-label": "Prize wheel" });
  wheelWrap.appendChild(wheelCv);
  wheelWrap.appendChild(h("div", { class: "gx-pointer", "aria-hidden": "true" }));
  wheelPane.appendChild(wheelWrap);
  var wheelBtn = h("button", { class: "tpl-btn tpl-btn-big tpl-btn-accent", type: "button", "data-i18n": "gx.spin", text: "SPIN", onclick: spin });
  wheelPane.appendChild(wheelBtn);
  var wheelOut = h("p", { class: "gx-wheel-out", "aria-live": "polite" });
  wheelPane.appendChild(wheelOut);
  wheelPane.appendChild(h("p", { class: "gx-note", "data-i18n": "gx.wheelNote", text: "Wheel odds = each prize's weight. Card-pool odds & pity live in the config JSON." }));

  var R = 160, CX = 170, CY = 170;
  var angle = -Math.PI / 2, spinning = false;

  function drawWheel(highlight) {
    var ctx = wheelCv.getContext("2d");
    var segs = G.wheelSegments(cfg);
    var seg = (Math.PI * 2) / segs.length;
    ctx.clearRect(0, 0, 340, 340);
    for (var i = 0; i < segs.length; i++) {
      var a0 = angle + i * seg, a1 = a0 + seg;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = segColor(segs[i].item.rarity, i);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.font = "600 13px " + skinFont();
      ctx.fillText(truncate(segs[i].item.name, 14), R - 14, 5);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(CX, CY, 26, 0, Math.PI * 2);
    ctx.fillStyle = "var(--skin-panel-2)";
    ctx.fillStyle = getComputedStyle(demo).getPropertyValue("--skin-panel-2") || "#2a2537";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.stroke();
    if (highlight != null) {
      var ha = angle + highlight * seg + seg / 2;
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(ha);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(R - 10, 0);
      ctx.arc(0, 0, R - 10, 0, 0.01);
      ctx.stroke();
      ctx.restore();
    }
  }
  function segColor(rarity, i) {
    var map = { N: ["#5a6070", "#4c5261"], R: ["#3f7fc4", "#356da8"], SR: ["#8a4fc0", "#7641a6"], SSR: ["#d99a2b", "#bf8620"] };
    var pair = map[rarity] || ["#5a6070", "#4c5261"];
    return pair[i % 2];
  }
  function skinFont() {
    return getComputedStyle(demo).getPropertyValue("--skin-font") || "system-ui, sans-serif";
  }
  function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function spin() {
    if (spinning || busy) return;
    var price = cfg.currency.single;
    if (gems < price) { say("gx.noGems"); return; }
    spinning = true;
    gems -= price;
    syncWallet();
    wheelBtn.disabled = true;
    var target = G.wheelPick(cfg);
    var segs = G.wheelSegments(cfg);
    var seg = (Math.PI * 2) / segs.length;
    var jitter = (Math.random() - 0.5) * seg * 0.6;
    var final = -Math.PI / 2 - ((target + 0.5) * seg) - jitter;
    var TWO_PI = Math.PI * 2;
    var current = angle;
    var delta = (final - current) % TWO_PI;
    if (delta < 0) delta += TWO_PI;
    var total = delta + TWO_PI * (reduced ? 0 : 5);
    var t0 = performance.now();
    var DUR = reduced ? 0 : 4200;
    wheelOut.textContent = "";

    (function frame(now) {
      var t = DUR ? Math.min(1, (now - t0) / DUR) : 1;
      var e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      angle = current + total * e;
      drawWheel(null);
      if (t < 1) requestAnimationFrame(frame);
      else {
        angle = current + total;
        drawWheel(target);
        var won = cfg.items[target];
        while (wheelOut.firstChild) wheelOut.removeChild(wheelOut.firstChild);
        wheelOut.appendChild(h("span", { "data-i18n": "gx.won", "data-i18n-vars": JSON.stringify({item:won.name}), text: defaultText("gx.won").replace("{item}", won.name) }));
        history = G.record(history, [won], Date.now(), G.HISTORY_LIMIT);
        syncHistory(); persist();
        say("gx.won", { item: won.name });
        spinning = false;
        wheelBtn.disabled = false;
        refreshI18n();
      }
    })(t0);
  }

  // ---- record pane: disclosure + history ------------------------------------------

  record.appendChild(h("h3", { text: "Drop rates", "data-i18n": "gx.rates" }));
  var oddsBox = h("div", { class: "gx-odds" });
  record.appendChild(oddsBox);
  record.appendChild(h("p", { class: "gx-note", "data-i18n": "gx.pityGuarantee", "data-i18n-vars": JSON.stringify({n:cfg.pity.ssr}), text: "SSR guaranteed within 90 pulls" }));
  record.appendChild(h("h3", { text: "Pull history", "data-i18n": "gx.history" }));
  var histList = h("ul", { class: "gx-hist" });
  record.appendChild(histList);
  var clearRow = h("div", { class: "gx-btnrow" });
  clearRow.appendChild(h("button", { class: "tpl-btn tpl-btn-ghost", type: "button", "data-i18n": "gx.clear", text: "Clear", onclick: function () { history = []; persist(); syncHistory(); } }));
  record.appendChild(clearRow);

  function syncOdds() {
    var guarantee = record.querySelector("[data-i18n=\"gx.pityGuarantee\"]");
    if (guarantee) guarantee.setAttribute("data-i18n-vars", JSON.stringify({n:cfg.pity.ssr}));
    oddsBox.innerHTML = "";
    var table = h("table", {});
    var thead = h("thead", {});
    var trh = h("tr", {});
    ["gx.rarity", "gx.item", "gx.odds"].forEach(function (k) {
      trh.appendChild(h("th", { "data-i18n": k, text: defaultText(k), scope: "col" }));
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = h("tbody", {});
    cfg.items.forEach(function (it) {
      var tr = h("tr", { class: "r-" + it.rarity });
      tr.appendChild(h("td", { text: it.rarity }));
      tr.appendChild(h("td", { text: it.name }));
      tr.appendChild(h("td", { text: (G.itemOdds(cfg, it) * 100).toFixed(2) + "%" }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    oddsBox.appendChild(table);
    var wheelOdds = h("p", {class:"gx-note", text: "Wheel: " + G.wheelSegments(cfg).map(function (s) {return s.item.name + " " + (s.odds * 100).toFixed(1) + "%";}).join(" · ")});
    oddsBox.appendChild(wheelOdds);
  }

  function syncHistory() {
    histList.innerHTML = "";
    if (!history.length) {
      histList.appendChild(h("li", { class: "gx-hist-empty", "data-i18n": "gx.historyEmpty", text: "No pulls yet — try your luck!" }));
      return;
    }
    for (var i = history.length - 1; i >= 0; i--) {
      var e = history[i];
      var li = h("li", { class: "r-" + e.item.rarity });
      li.appendChild(h("time", { text: clock(e.at) }));
      li.appendChild(h("b", { text: e.item.name }));
      li.appendChild(h("span", { text: e.item.rarity }));
      histList.appendChild(li);
    }
  }
  function clock(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function saveBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---- boot -------------------------------------------------------------------

  function setSkin(s) {
    if (!S.isSkin(s)) return;
    skin = s;
    demo.setAttribute("data-skin", s);
    Array.prototype.forEach.call(skinRow.children, function (b) {
      b.classList.toggle("on", b.getAttribute("data-skin-id") === s);
    });
    drawIdle();
    drawWheel(null);
    persist();
  }

  restore();
  syncPanel();
  syncOdds();
  syncWallet();
  syncPity();
  syncHistory();
  setSkin(skin);
  root.addEventListener("resize", function () { drawWheel(null); });
})();
