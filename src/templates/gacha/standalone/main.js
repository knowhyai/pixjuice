/* PixJuice gacha template — demo UI (vanilla, zero deps).
   Ships in the ZIP as js/main.js (classic script) and is imported by the site
   demo page, which only adds localization + the source-code section on top.
   Builds the whole demo into #app; expects the globals PixGacha (js/gacha-core.js)
   and PixSkins (js/skins.js) to exist, and styles.css in scope.

   Dynamic labels carry data-i18n keys with English text as the default. A host
   page may define window.PixI18nRefresh() — it is called after dynamic inserts
   so the host can re-translate; the offline build includes a language selector. */

function formatGachaLabSummary(out, multiPulls, translate) {
  var batchDetails = "";
  if (out.mode === "ten") {
    var batches = Math.floor(out.pulls / multiPulls);
    var singles = out.pulls % multiPulls;
    batchDetails = translate("gx.lab.metaBatches").replace("{batches}", String(batches));
    if (singles) batchDetails += " + " + translate("gx.lab.metaRemainder").replace("{singles}", String(singles));
    batchDetails = " (" + batchDetails + ")";
  }
  var key = out.firstSsrAt == null ? "gx.lab.metaNone" : "gx.lab.meta";
  return translate(key)
    .replace("{pulls}", String(out.pulls))
    .replace("{batchDetails}", batchDetails)
    .replace("{pity}", String(out.pity.ssr))
    .replace("{first}", String(out.firstSsrAt == null ? "" : out.firstSsrAt));
}

(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis;
  var G = root.PixGacha;
  var S = root.PixSkins;
  var host = document.getElementById("app");
  if (!host || !G || !S) return;

  var reduced = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STORE_KEY = "pix-tpl-gacha-v2";
  var ASSETS_BASE = location.protocol === "file:" ? "assets/chest-wood" : "/free-assets/chest-wood";

  // ---- state -----------------------------------------------------------------

  var cfg = G.validateConfig(G.DEFAULT_CONFIG).config;
  var pity = G.makeState(0, 0);
  var history = [];
  var gems = 6000;
  var skin = "realistic";
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
    "gx.tenNote": "This 10-pull guarantees at least one SR or better.",
    "gx.tenNoteOff": "SR+ requires a batch of at least {n}; the 10-pull has no SR+ guarantee.",
    "gx.ssrPityOff": "SSR hard pity is off.",
    "gx.pityNow": "SSR pity: {n}/{max}",
    "gx.rates": "View rates", "gx.pool": "Prize pool", "gx.odds": "Odds",
    "gx.rarity": "Rarity", "gx.item": "Item", "gx.pulls": "Pulls",
    "gx.history": "Pull history", "gx.historyEmpty": "No pulls yet — try your luck!",
    "gx.clear": "Clear", "gx.spin": "Spin", "gx.spinning": "Spinning…",
    "gx.won": "You got: {item}!", "gx.opening": "Opening…",
    "gx.settings": "Adjust game settings", "gx.skin": "Skin",
    "gx.ratesCfg": "Rates (N / R / SR / SSR)", "gx.pityCfg": "SSR pity (pulls)",
    "gx.loadCfg": "Import settings", "gx.saveCfg": "Export settings",
    "gx.reset": "Reset demo", "gx.cfgOk": "Config applied.",
    "gx.cfgBad": "Invalid config: {e}",
    "gx.noGems": "Out of gems — the demo currency is free, press Reset.",
    "gx.resetDone": "Demo reset.", "gx.rar.N": "Normal", "gx.rar.R": "Rare",
    "gx.rar.SR": "Epic", "gx.rar.SSR": "Legendary",
    "tpl.skin": "Skin", "tpl.skin.realistic": "Semi-Realistic", "tpl.skin.stylized": "Stylized",
    "tpl.skin.lowpoly": "Clean Low Poly", "tpl.skin.pixel": "Pixel Art",
    "gx.lab.h": "Developer rate experiment",
    "gx.lab.lede": "Advertised card-pool rates ignore pity. This lab runs the same engine as the card pool (not the crate reel, which has no pity). Tune the sliders above, then run a batch. The theoretical SSR column applies only to single pulls with hard pity enabled — it is not a model of the ten-pull SR+ guarantee.",
    "gx.lab.pulls": "Simulated pulls",
    "gx.lab.mode": "Pull mode",
    "gx.lab.single": "Single pulls (SSR hard pity only)",
    "gx.lab.ten": "10-pull batches",
    "gx.lab.run": "Run simulation",
    "gx.lab.rarity": "Rarity",
    "gx.lab.advertised": "Advertised (no pity)",
    "gx.lab.expected": "Expected (single + hard pity only)",
    "gx.lab.observed": "Observed",
    "gx.lab.forced": "Forced",
    "gx.lab.note": "A design experiment on this template's rules, not a recreation of any commercial title. Observed values have sampling error; the denominator is the number of individual pulls in the run. For single pulls with hard pity N and base rate p, expected SSR is p / (1 − (1−p)^N). Ten-pull mode (and the SR+ guarantee) has no such closed form here — only observed counts are shown. Pity 0 turns hard pity off; the SR+ batch threshold is separate. Export is the same config.json as the demo. Numbers are tunable defaults. The lab uses the live ×10 batch size. Leftover pulls are singles.",
    "gx.lab.export": "Download this config.json",
    "gx.lab.meta": "Ran {pulls} individual pulls{batchDetails} · SSR pity {pity} · first SSR at pull {first}",
    "gx.lab.metaNone": "Ran {pulls} individual pulls{batchDetails} · SSR pity {pity} · no SSR in this run",
    "gx.lab.metaBatches": "10-pull batches: {batches}",
    "gx.lab.metaRemainder": "leftover singles: {singles}",
    "gx.lab.na": "—",
    "gx.lab.forcedSsr": "{n} SSR",
    "gx.lab.forcedSr": "{n} SR+",
    "gx.lab.running": "Running…",
    "gx.pityOff": "0 = off",
  };
  function defaultText(key) {
    if (typeof root.PixTranslate === "function") return root.PixTranslate(key);
    var lang=document.documentElement.lang||"en";
    if(root.PixStrings && root.PixStrings.en[key]) return (root.PixStrings[lang]||root.PixStrings.en)[key];
    return typeof EN[key] === "string" ? EN[key] : key.split(".").pop();
  }
  function refreshI18n() {
    if (typeof root.PixI18nRefresh === "function") root.PixI18nRefresh();
  }
  function say(key, vars) {
    var t = defaultText(key);
    if (vars) for (var k in vars) t = t.replace("{" + k + "}", String(vars[k]));
    var el = h("div", { class: "tpl-toast", role: "status", "data-i18n": key, "data-i18n-vars": JSON.stringify(vars || {}), text: t });
    stage.appendChild(el);
    refreshI18n();
    requestAnimationFrame(function () { el.classList.add("on"); });
    setTimeout(function () { el.classList.remove("on"); setTimeout(function () { el.remove(); }, 350); }, 2600);
  }

  // ---- layout ----------------------------------------------------------------

  host.innerHTML = "";
  var demo = h("div", { class: "tpl-demo gx-demo", "data-skin": skin });
  var side = h("aside", { class: "tpl-side" });
  var stage = h("section", { class: "tpl-stage" });
  var record = h("aside", { class: "tpl-record" });
  demo.appendChild(side);
  demo.appendChild(stage);
  demo.appendChild(record);
  host.appendChild(demo);

  // ---- rate lab (same live config as the card-pool settings) -------------------

  var lab = h("details", { class: "gx-lab" });
  lab.appendChild(h("summary", {}, [lbl("gx.lab.h")]));
  lab.appendChild(h("p", { class: "gx-lab-lede", text: EN["gx.lab.lede"], "data-i18n": "gx.lab.lede" }));
  var labRow = h("div", { class: "gx-lab-controls" });
  var pullsLabel = h("label", { class: "gx-lab-field" });
  pullsLabel.appendChild(h("span", { text: "Simulated pulls", "data-i18n": "gx.lab.pulls" }));
  var pullsSel = h("select", { "aria-label": "Simulated pulls" });
  [["10000", "10,000"], ["50000", "50,000"], ["100000", "100,000"]].forEach(function (opt) {
    var o = h("option", { value: opt[0], text: opt[1] });
    if (opt[0] === "50000") o.selected = true;
    pullsSel.appendChild(o);
  });
  pullsLabel.appendChild(pullsSel);
  var modeLabel = h("label", { class: "gx-lab-field" });
  modeLabel.appendChild(h("span", { text: "Pull mode", "data-i18n": "gx.lab.mode" }));
  var modeSel = h("select", { "aria-label": "Pull mode" });
  modeSel.appendChild(h("option", { value: "single", text: EN["gx.lab.single"], "data-i18n": "gx.lab.single" }));
  var modeTen = h("option", { value: "ten", text: EN["gx.lab.ten"], "data-i18n": "gx.lab.ten" });
  modeSel.appendChild(modeTen);
  modeLabel.appendChild(modeSel);
  var runBtn = h("button", { class: "tpl-btn", type: "button", "data-i18n": "gx.lab.run", text: "Run simulation" });
  var exportLabBtn = h("button", { class: "tpl-btn tpl-btn-ghost", type: "button", "data-i18n": "gx.lab.export", text: "Download this config.json", onclick: downloadConfig });
  labRow.appendChild(pullsLabel);
  labRow.appendChild(modeLabel);
  labRow.appendChild(runBtn);
  labRow.appendChild(exportLabBtn);
  lab.appendChild(labRow);
  var labMeta = h("p", { class: "gx-lab-meta", hidden: "" });
  var labTable = h("table", { class: "gx-lab-table", hidden: "" });
  lab.appendChild(labMeta);
  lab.appendChild(labTable);
  lab.appendChild(h("p", { class: "gx-lab-note", text: EN["gx.lab.note"], "data-i18n": "gx.lab.note" }));
  (document.getElementById("gx-developer") || host).appendChild(lab);

  function pct(x) { return (x * 100).toFixed(3) + "%"; }
  function forcedCell(r, out) {
    if (r === "SSR") return defaultText("gx.lab.forcedSsr").replace("{n}", String(out.forcedSsr));
    if (r === "SR") return defaultText("gx.lab.forcedSr").replace("{n}", String(out.forcedSr));
    return defaultText("gx.lab.na");
  }
  function renderLab(out) {
    labMeta.hidden = false;
    labMeta.textContent = formatGachaLabSummary(out, G.MULTI_PULLS, defaultText);
    labTable.hidden = false;
    labTable.innerHTML = "";
    var thead = h("thead");
    var head = h("tr");
    ["gx.lab.rarity", "gx.lab.advertised", "gx.lab.expected", "gx.lab.observed", "gx.lab.forced"].forEach(function (key) {
      head.appendChild(h("th", { text: defaultText(key), "data-i18n": key }));
    });
    thead.appendChild(head);
    labTable.appendChild(thead);
    var tbody = h("tbody");
    G.RARITIES.forEach(function (r) {
      var tr = h("tr");
      tr.appendChild(h("th", { scope: "row", text: r }));
      tr.appendChild(h("td", { text: pct(out.advertised[r]) }));
      var expectedText = defaultText("gx.lab.na");
      if (r === "SSR" && out.mode === "single" && out.expectedSsrHardPity != null) expectedText = pct(out.expectedSsrHardPity);
      tr.appendChild(h("td", { text: expectedText }));
      tr.appendChild(h("td", { text: pct(out.observed[r]) }));
      tr.appendChild(h("td", { text: forcedCell(r, out) }));
      tbody.appendChild(tr);
    });
    labTable.appendChild(tbody);
    refreshI18n();
  }
  runBtn.addEventListener("click", function () {
    var n = Number(pullsSel.value);
    var mode = modeSel.value === "ten" ? "ten" : "single";
    if (runBtn.disabled) return;
    runBtn.disabled = true;
    labMeta.hidden = false;
    labMeta.textContent = defaultText("gx.lab.running");
    refreshI18n();
    setTimeout(function () {
      try {
        renderLab(G.simulate(cfg, { pulls: n, mode: mode }));
      } catch (e) {
        say("gx.cfgBad", { e: e && e.message ? e.message : String(e) });
      }
      runBtn.disabled = false;
    }, 0);
  });


  // ---- side panel: game settings ---------------------------------------------

  var settings = h("details", { class: "gx-disclosure" }, [h("summary", {}, [lbl("gx.settings")])]);
  var railInfo = h("div", { class: "gx-rail-info" });
  side.appendChild(railInfo);
  side.appendChild(settings);
  var skinRow = h("div", { class: "gx-skins", role: "group" });



  settings.appendChild(h("h4", { text: "Rates (N / R / SR / SSR)", "data-i18n": "gx.ratesCfg" }));
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
    settings.appendChild(row);
  });

  var pityRow = h("label", { class: "gx-slider gx-pity-settings" });
  pityRow.appendChild(h("b", { text: "SSR pity", "data-i18n": "gx.pityCfg" }));
  var pityInput = h("input", { type: "number", min: "0", max: "1000", step: "1", "aria-label": "SSR hard pity (0 disables it)" });
  pityRow.appendChild(pityInput);
  pityRow.appendChild(h("span", { class: "gx-pityhint", "data-i18n": "gx.pityOff", text: defaultText("gx.pityOff") }));
  settings.appendChild(pityRow);
  pityInput.addEventListener("change", function () {
    if (busy || spinning) return;
    var v = G.validateConfig({ rates: cfg.rates, pity: { ssr: Number(pityInput.value), sr: cfg.pity.sr }, items: cfg.items, currency: cfg.currency });
    if (v.ok) { cfg = v.config; syncPanel(); syncOdds(); syncPity(); drawWheel(null); persist(); }
  });

  var cfgRow = h("div", { class: "gx-btnrow" });
  var file = h("input", { type: "file", accept: ".json,application/json", class: "gx-file", "aria-label": "Import settings" });
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
  cfgRow.appendChild(h("button", { class: "tpl-btn", type: "button", "data-i18n": "gx.loadCfg", text: "Import settings", onclick: function () { file.click(); } }));
  cfgRow.appendChild(h("button", { class: "tpl-btn", type: "button", "data-i18n": "gx.saveCfg", text: "Export settings", onclick: downloadConfig }));
  cfgRow.appendChild(h("button", { class: "tpl-btn tpl-btn-ghost", type: "button", "data-i18n": "gx.reset", text: "Reset demo", onclick: function () { if (!busy && !spinning) resetAll(); } }));
  settings.appendChild(cfgRow);

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
  var tabCase=h("button",{class:"gx-tab",role:"tab","data-i18n":"cx.tab",text:defaultText("cx.tab"),onclick:function(){mode("case");}});
  tabs.appendChild(tabCase);
  tabs.appendChild(tabPool);
  tabs.appendChild(tabWheel);
  stage.appendChild(tabs);

  var poolPane = h("div", { class: "gx-pane", role: "tabpanel", hidden: "" });
  var wheelPane = h("div", { class: "gx-pane", role: "tabpanel", hidden: "" });
  var casePane=h("div",{class:"gx-pane cx-pane",role:"tabpanel"});
  stage.appendChild(casePane);
  stage.appendChild(poolPane);
  stage.appendChild(wheelPane);

  function mode(m) {
    if(busy||spinning)return;
    [[tabCase,casePane,'case'],[tabPool,poolPane,'pool'],[tabWheel,wheelPane,'wheel']].forEach(function(row){var active=row[2]===m;row[0].classList.toggle('on',active);row[0].setAttribute('aria-selected',String(active));row[1].hidden=!active;});
    crateContents.hidden = crateInfo.hidden = m !== "case";
    poolInfo.hidden = m !== "pool";
    wheelInfo.hidden = m !== "wheel";
    rates.hidden = m === "case";
    poolOdds.hidden = guarantee.hidden = tenNote.hidden = m !== "pool";
    wheelOdds.hidden = m !== "wheel";
    side.scrollTop = 0;
    stage.scrollTop = 0;
    record.scrollTop = 0;
    refreshI18n();
    if (m === "wheel") drawWheel(wheelWinner);
  }

  // ---- pool pane ---------------------------------------------------------------

  var wallet = h("div", { class: "gx-wallet" });
  var gemsEl = h("b", { text: String(gems) });
  wallet.appendChild(h("span", { class: "gx-gem", "aria-hidden": "true" }));
  wallet.appendChild(gemsEl);
  wallet.appendChild(lbl("gx.gemsLeft", "gems"));
  var poolInfo = h("div", { class: "gx-mode-info" }, [wallet]);
  railInfo.appendChild(poolInfo);

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
  poolInfo.appendChild(pityBar);

  var btnRow = h("div", { class: "gx-btnrow" });
  var b1 = h("button", { class: "tpl-btn tpl-btn-big", type: "button", "data-i18n": "gx.pull1", text: "Pull ×1", onclick: function () { doPull(1); } });
  var b10 = h("button", { class: "tpl-btn tpl-btn-big tpl-btn-accent", type: "button", "data-i18n": "gx.pull10", text: "Pull ×10", onclick: function () { doPull(G.MULTI_PULLS); } });
  btnRow.appendChild(b1);
  btnRow.appendChild(b10);
  poolPane.appendChild(btnRow);
  var tenNote = h("p", { class: "gx-note" });

  var results = h("div", { class: "gx-results", "aria-live": "polite" });
  poolPane.appendChild(results);

  function syncWallet() { gemsEl.textContent = String(gems); caseWallet.textContent = wheelGems.textContent = String(gems); }
  function syncPity() {
    var max = cfg.pity.ssr;
    var n = Math.min(pity.sinceSsr, max);
    // max 0 means hard pity is off — guard the fill math instead of writing "NaN%".
    pityFill.style.width = max >= 1 ? (n / max) * 100 + "%" : "0%";
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
      say("gx.won", { item: itemName(best) });
      busy = false;
      renderCards(show);
    };

    var peak = show.reduce(function(a,b){return rank(b)>rank(a)?b:a;},show[0]);
    revealLight(peak.rarity);
    if (!reduced) {
      chestNote.hidden = false;
      playChest(["open", "open_burst"], function () {
        chestNote.hidden = true;
        finish();
      });
    } else {
      finish();
    }
  }

  function revealLight(rarity) {
    var old=chestWrap.querySelector(".gx-reveal");if(old)old.remove();
    var fx=h("div",{class:"gx-reveal r-"+rarity,"aria-hidden":"true"});
    fx.appendChild(h("i",{class:"gx-flare"}));
    if(!reduced){
      var n={N:4,R:10,SR:20,SSR:36}[rarity]||4;
      for(var j=0;j<n;j++){
        var theta=j*2.39996,dist=35+(j%7)*16;
        fx.appendChild(h("i",{class:"gx-spark",style:"--dx:"+Math.cos(theta)*dist+"px;--dy:"+(Math.sin(theta)*dist-50)+"px;--delay:"+(j%6)*.055+"s"}));
      }
    }
    chestWrap.appendChild(fx);
    setTimeout(function(){fx.remove();},reduced?400:2200);
  }

  function rank(item) { return G.RARITIES.indexOf(item.rarity); }

  function renderCards(items) {
    items.forEach(function (it, i) {
      var card = h("div", { class: "gx-card r-" + it.rarity, style: "transition-delay:" + i * 70 + "ms" });
      var inner = h("div", { class: "gx-card-in" });
      var back = h("div", { class: "gx-face gx-back" });
      back.appendChild(h("span", { class: "gx-mark", "aria-hidden": "true", text: "◇" }));
      var front = h("div", { class: "gx-face gx-front" });
      front.appendChild(h("i", {class:"gx-sigil", "aria-hidden":"true",text:it.rarity === "SSR" ? "✦" : "◇"}));
      front.appendChild(h("b", { text: itemName(it) }));
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
        if (!img) return done(); // Keep the rules usable if an image fails to load.
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

  var wheelWallet = wallet.cloneNode(true);
  var wheelGems = wheelWallet.querySelector("b");
  var wheelCost = h("b", {});
  var wheelInfo = h("div", { class: "gx-mode-info" }, [wheelWallet, h("p", { class: "gx-note" }, [
    lbl("gx.spin"), h("span", { text: " · " }), wheelCost, h("span", { text: " " }), lbl("gx.gemsLeft")
  ])]);
  railInfo.appendChild(wheelInfo);
  var wheelWrap = h("div", { class: "gx-wheel-wrap" });
  var wheelCv = h("canvas", { width: "340", height: "340", "aria-label": "Prize wheel" });
  wheelWrap.appendChild(wheelCv);
  wheelPane.appendChild(wheelWrap);
  var wheelOut = h("p", { class: "gx-wheel-out", "aria-live": "polite" });
  wheelPane.appendChild(wheelOut);
  var wheelBtn = h("button", { class: "tpl-btn tpl-btn-big tpl-btn-accent", type: "button", "data-i18n": "gx.spin", text: "Spin", onclick: spin });
  wheelPane.appendChild(wheelBtn);

  var wheelSize = 340, wheelCenter = 170, wheelFace = 146;
  var wheelIconRadius = 53, wheelLabelRadius = 106;
  var angle = -Math.PI / 2, spinning = false, wheelWinner = null;
  var wheelColors = {
    N: ["#16383c", "#387b73", "#214b4e"],
    R: ["#122c51", "#376ca9", "#1a3965"],
    SR: ["#35204e", "#8b54a0", "#48265f"],
    SSR: ["#754115", "#ffce70", "#be792f"]
  };
  var alternateCommon = ["#17332d", "#497d5d", "#284b3b"];
  var wheelIcons = new Map();
  var hubFacet = new Path2D("M0 -18 L6 -8 L15 -2 L6 3 L0 14 L-5 3 L-14 -2 L-5 -7Z");
  var pointerEdge = new Path2D("M-17 10 Q-15 5 -9 5 H9 Q15 5 17 10 L14 21 L0 39 L-14 21Z");
  var pointerFace = new Path2D("M-14 10 H14 L11 20 L0 34 L-11 20Z");

  function wheelGradient(gradient, stops) {
    stops.forEach(function (stop) { gradient.addColorStop(stop[0], stop[1]); });
    return gradient;
  }

  function wheelDisc(ctx, x, y, radius, fill) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function wheelSector(ctx, inner, outer, start, end) {
    ctx.beginPath();
    ctx.arc(0, 0, outer, start, end);
    ctx.arc(0, 0, inner, end, start, true);
    ctx.closePath();
  }

  function drawWheel(highlight) {
    wheelWinner = highlight;
    var width = wheelCv.getBoundingClientRect().width;
    if (!width) return;
    var pixels = Math.round(width * (root.devicePixelRatio || 1));
    if (wheelCv.width !== pixels || wheelCv.height !== pixels) {
      wheelCv.width = wheelCv.height = pixels;
    }
    var ctx = wheelCv.getContext("2d");
    var scale = pixels / wheelSize;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, wheelSize, wheelSize);
    ctx.save();
    ctx.translate(wheelCenter, wheelCenter);

    var brass = wheelGradient(ctx.createLinearGradient(-100, -145, 60, 155), [
      [0, "#88552d"], [.15, "#fff0bd"], [.35, "#b77c42"], [.51, "#624027"],
      [.7, "#e3ab65"], [.86, "#b27a43"], [1, "#edc790"]
    ]);
    wheelDisc(ctx, 0, 4, 162, "#422919");
    wheelDisc(ctx, 0, 0, 162, brass);
    wheelDisc(ctx, 0, 0, 158, "#6d472a");
    wheelDisc(ctx, 0, 0, 157, wheelGradient(ctx.createLinearGradient(0, -157, 0, 157), [
      [0, "#483321"], [.42, "#7d5937"], [1, "#34251f"]
    ]));
    wheelDisc(ctx, 0, 0, 150, brass);
    wheelDisc(ctx, 0, 0, 147, "#422821");

    var items = cfg.items;
    var seg = 2 * Math.PI / items.length;
    var font = getComputedStyle(demo).getPropertyValue("--skin-font") || "system-ui, sans-serif";
    var inset = Math.min(.02, seg * .14);
    for (var i = 0; i < items.length; i++) {
      var start = angle + i * seg;
      var end = start + seg;
      var middle = start + seg / 2;
      var rarity = items[i].rarity;
      var colors = rarity === "N" && i % 2 ? alternateCommon : wheelColors[rarity];

      wheelSector(ctx, 25, wheelFace, start, end);
      ctx.fillStyle = wheelGradient(ctx.createRadialGradient(0, 0, 27, 0, 0, wheelFace), [
        [0, colors[0]], [.72, colors[1]], [.94, colors[2]], [1, colors[0]]
      ]);
      ctx.fill();
      ctx.fillStyle = brass;
      wheelSector(ctx, 25, wheelFace, start, start + inset);
      ctx.fill();
      ctx.fillStyle = "#22130f88";
      wheelSector(ctx, 25, wheelFace, end - inset, end);
      ctx.fill();

      if (i === highlight) {
        wheelSector(ctx, 33, 142, start + inset * 2, end - inset * 2);
        ctx.fillStyle = wheelGradient(ctx.createRadialGradient(0, 0, 33, 0, 0, 142), [
          [0, "#ffcf7108"], [.65, "#ffe19a43"], [1, "#ffdc7d86"]
        ]);
        ctx.fill();
        ctx.strokeStyle = "#fff1b4";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#ffd270";
        ctx.shadowBlur = 9;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.save();
      ctx.rotate(middle);
      wheelDisc(ctx, 154, 0, 2.5, "#24160f");
      wheelDisc(ctx, 153.7, -.5, 1.7, i === highlight ? "#fff3c5" : "#c19663");
      ctx.restore();
      drawWheelItem(ctx, items[i], middle, seg / 2 - inset, font);
    }

    // The hub and pointer stay fixed while the face turns underneath.
    ctx.shadowColor = "#201108bd";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 4;
    wheelDisc(ctx, 0, 0, 32, "#492b1c");
    ctx.shadowBlur = ctx.shadowOffsetY = 0;
    wheelDisc(ctx, 0, -1, 30, wheelGradient(ctx.createLinearGradient(-18, -27, 12, 28), [
      [0, "#fff3cd"], [.33, "#b57a40"], [.53, "#58371e"], [.84, "#e7b473"], [1, "#9c6538"]
    ]));
    wheelDisc(ctx, 0, -1, 24, "#4a3225");
    wheelDisc(ctx, 0, -2, 21, wheelGradient(ctx.createRadialGradient(-7, -12, 1, 0, -2, 22), [
      [0, "#bcf3dd"], [.33, "#519d8e"], [.76, "#215653"], [1, "#153035"]
    ]));
    ctx.fillStyle = "#d0ffdf70";
    ctx.fill(hubFacet);
    ctx.restore();

    ctx.save();
    ctx.translate(wheelCenter, 0);
    ctx.fillStyle = "#54321c";
    ctx.shadowColor = "#170d09e0";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 4;
    ctx.fill(pointerEdge);
    ctx.shadowBlur = ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "#f1d091";
    ctx.lineWidth = 1.2;
    ctx.stroke(pointerEdge);
    ctx.fillStyle = wheelGradient(ctx.createLinearGradient(-14, 14, 12, 27), [
      [0, "#aa733e"], [.46, "#ffedb7"], [.53, "#d29b53"], [1, "#87532c"]
    ]);
    ctx.fill(pointerFace);
    wheelDisc(ctx, 0, 15, 3.6, "#6d482c");
    wheelDisc(ctx, 0, 14.5, 2.2, highlight == null ? "#eec785" : "#fffbe3");
    ctx.restore();
  }

  function drawWheelItem(ctx, item, middle, halfAngle, font) {
    var gold = item.rarity === "SSR";
    var ink = gold ? "#321b0b" : "#fff7df";
    var itemPath = iconPath(item);
    var path = wheelIcons.get(itemPath);
    if (!path) {
      path = new Path2D(itemPath);
      wheelIcons.set(itemPath, path);
    }

    var across = Math.sin(Math.min(halfAngle, Math.PI / 2));
    var dx = Math.cos(middle);
    var dy = Math.sin(middle);
    var iconSize = Math.min(28, wheelIconRadius * across * Math.SQRT2);
    ctx.save();
    ctx.translate(wheelIconRadius * dx - iconSize / 2, wheelIconRadius * dy - iconSize / 2);
    ctx.scale(iconSize / 84, iconSize / 84);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = 8;
    ctx.strokeStyle = gold ? "#ffdf91" : "#132023";
    ctx.stroke(path);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = ink;
    ctx.stroke(path);
    ctx.restore();

    // Fit the horizontal text box inside a circle that clears both dividers at any angle.
    var room = Math.min(36, wheelLabelRadius * across);
    var size = Math.min(13, room / 2);
    var padding = Math.min(2, room / 8);
    var maxWidth = 2 * (Math.sqrt(room * room - Math.pow(size / 2 + padding, 2)) - padding);
    var name = itemName(item);
    ctx.font = "700 " + size + "px " + font;
    var lines = [name];
    if (ctx.measureText(name).width > maxWidth) {
      var chars = Array.from(name);
      var split = Math.ceil(chars.length / 2);
      var space = name.lastIndexOf(" ", split);
      if (space > split * .65) split = Array.from(name.slice(0, space)).length;
      lines = [chars.slice(0, split).join("").trim(), chars.slice(split).join("").trim()];
      maxWidth = 2 * (Math.sqrt(room * room - Math.pow(size * 1.05 + padding, 2)) - padding);
    }
    var widest = Math.max.apply(null, lines.map(function (line) { return ctx.measureText(line).width; }));
    size *= Math.min(1, maxWidth / widest);
    ctx.font = "700 " + size + "px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.min(2.6, size / 4);
    ctx.strokeStyle = gold ? "#ffe7a0" : "#17232b";
    ctx.fillStyle = ink;
    var labelX = wheelLabelRadius * dx;
    var labelY = wheelLabelRadius * dy;
    lines.forEach(function (line, i) {
      var y = labelY + (i - (lines.length - 1) / 2) * (size * 1.1);
      ctx.strokeText(line, labelX, y);
      ctx.fillText(line, labelX, y);
    });
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
      if (t < 1) {
        drawWheel(null);
        requestAnimationFrame(frame);
      } else {
        angle = current + total;
        drawWheel(target);
        var won = cfg.items[target];
        while (wheelOut.firstChild) wheelOut.removeChild(wheelOut.firstChild);
        wheelOut.appendChild(h("span", { "data-i18n": "gx.won", "data-i18n-vars": JSON.stringify({item:itemName(won)}), text: defaultText("gx.won").replace("{item}", itemName(won)) }));
        history = G.record(history, [won], Date.now(), G.HISTORY_LIMIT);
        syncHistory(); persist();
        spinning = false;
        wheelBtn.disabled = false;
        refreshI18n();
      }
    })(t0);
  }

  // The winner is fixed before any visual movement or skip action.
  var C = root.PixCase, crate = C.cases[0], pendingCase = null, caseAnimation = null;
  var caseHeader = h('div',{class:'cx-heading'},[lbl('cx.choose')]);
  casePane.appendChild(caseHeader);
  var crateSelect=h('select',{'aria-label':defaultText('cx.choose'),class:'cx-select'});
  C.cases.forEach(function(c){crateSelect.appendChild(h('option',{value:c.id,text:defaultText('cx.'+c.id),'data-i18n':'cx.'+c.id}));});
  casePane.appendChild(crateSelect);
  var viewport=h('div',{class:'cx-viewport'}),reel=h('div',{class:'cx-reel'});
  viewport.appendChild(h("div", { class: "cx-reel-window" }, [reel]));viewport.appendChild(h('i',{class:'cx-line','aria-hidden':'true'}));
  casePane.appendChild(viewport);
  var controls=h('div',{class:'cx-controls'}),quick=h('input',{type:'checkbox',id:'cx-quick'}),sound=h('input',{type:'checkbox',id:'cx-sound'});
  controls.appendChild(h('label',{},[quick,lbl('cx.quick')]));controls.appendChild(h('label',{},[sound,lbl('cx.sound')]));
  var crateInfo = h("div", { class: "gx-mode-info" }, [controls, h("p", { class: "cx-note" }, [lbl("cx.note")])]);
  railInfo.appendChild(crateInfo);
  var crateWallet = wallet.cloneNode(true);
  var caseWallet = crateWallet.querySelector('b');
  casePane.appendChild(crateWallet);
  var openButton=h('button',{class:'tpl-btn tpl-btn-accent tpl-btn-big','data-i18n':'cx.open',text:defaultText('cx.open'),onclick:openCrate});
  var skipButton=h('button',{class:'tpl-btn',hidden:'','data-i18n':'cx.skip',text:defaultText('cx.skip'),onclick:function(){if(caseAnimation)caseAnimation.finish();}});
  casePane.appendChild(h('div',{class:'gx-btnrow'},[openButton,skipButton]));
  var contentList = h("div", { class: "cx-contents" });
  var crateContents = h("section", { class: "cx-inventory" }, [
    h("h3", {}, [lbl("cx.contents")]), contentList
  ]);
  record.appendChild(crateContents);
  crateSelect.addEventListener('change',function(){crate=C.cases.find(function(c){return c.id===crateSelect.value;});drawContents();idleReel();});
  var audio=null;
  function tone(reveal,rarity){
    if(!sound.checked)return;
    try{
      audio=audio||new (root.AudioContext||root.webkitAudioContext)();audio.resume();
      var level=C.rarities.indexOf(rarity),notes=reveal?(level>=5?[0,4,7,12]:[0,7]):[0];
      notes.forEach(function(note,i){var osc=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime+i*.065;
        osc.type=reveal?'sine':'triangle';osc.frequency.value=reveal?330*Math.pow(2,(note+level)/12):1300;
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(reveal?.07:.025,at+.004);gain.gain.exponentialRampToValueAtTime(.0001,at+(reveal?.45:.025));
        osc.connect(gain);gain.connect(audio.destination);osc.start(at);osc.stop(at+(reveal?.5:.03));});
    }catch(e){sound.checked=false;}
  }
  sound.addEventListener('change',function(){if(sound.checked)tone(false);});
  function itemName(it){var key='item.'+it.id;return (root.PixStrings.en[key]?defaultText(key):it.name)||it.id;}
  function iconPath(it){
    var shapes={
      'wooden-sword':'M24 58L55 17 64 15 64 24 33 65M23 47L42 62M25 61L18 71',
      'health-potion':'M34 15H48M37 15V31L25 48Q16 69 41 70Q66 69 57 48L45 31V15M28 49H55',
      'copper-coin':'M64 42A22 24 0 1 1 20 42A22 24 0 1 1 64 42ZM42 33L49 42 42 51 35 42Z',
      'cloth-scrap':'M19 27L33 20 43 25 66 20 60 42 65 59 50 64 38 59 19 65 24 47ZM30 36L49 32M31 47L51 43',
      'travelers-charm':'M36 23A6 6 0 1 1 48 23A6 6 0 1 1 36 23ZM42 29L60 46 42 66 24 46ZM42 39L49 46 42 54 35 46Z',
      'enchanted-grimoire':'M23 22H59Q65 22 65 28V62H30Q23 62 23 68ZM23 68Q23 73 30 73H62M33 22V61M49 31L52 40 60 43 52 46 49 54 46 46 38 43 46 40Z',
      'steel-blade':'M24 58L55 17 64 15 64 24 33 65M23 47L42 62M25 61L18 71',
      cloak:'M32 24Q41 8 50 24L66 65Q43 76 17 65ZM32 25L41 39 50 25M41 39V66',
      lantern:'M29 30H55L60 65H24ZM35 30V21Q42 9 49 21V30M42 40V57M34 49H50',
      crown:'M20 31L31 40 42 22 53 40 65 31 59 63H26ZM27 55H59',
      excalibur:'M42 15L62 32 57 57 42 71 24 57 21 32ZM21 32H62M42 15V71M24 57L62 32M21 32L57 57'
    };
    var rarityIndex = C.rarities.indexOf(it.rarity);
    if (rarityIndex < 0) rarityIndex = G.RARITIES.indexOf(it.rarity);
    return (Object.hasOwn(shapes,it.id) && shapes[it.id])||['M42 15L62 32 57 57 42 71 24 57 21 32ZM21 32H62M42 15V71','M26 22H59V65H26ZM33 22V65M39 34H52M39 43H52M39 52H49','M42 16C9 29 18 66 42 69C68 63 69 30 42 16ZM42 29V57M29 43H55'][rarityIndex%3];
  }
  function icon(it){
    return '<svg viewBox="0 0 84 84" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+iconPath(it)+'"/></svg>';
  }
  function caseCard(it){return h('div',{class:'cx-card','data-item':it.id,style:'--rarity:var(--case-'+it.rarity.toLowerCase()+')'},[h('div',{class:'cx-art',html:icon(it)}),h('b',{text:itemName(it)}),h('small',{text:defaultText('cx.'+it.rarity)})]);}
  function drawContents(){contentList.innerHTML='';crate.items.forEach(function(it){var card=caseCard(it);card.appendChild(h('em',{text:(it.probability*100).toFixed(1)+'%'}));contentList.appendChild(card);});refreshI18n();}
  function idleReel(){reel.innerHTML='';crate.items.concat(crate.items).forEach(function(it){reel.appendChild(caseCard(it));});reel.style.transform='translateX(-110px)';}
  function openCrate(){
    if(busy||spinning)return;if(gems<crate.price){say('gx.noGems');return;}
    busy=true;gems-=crate.price;syncWallet();persist();
    openButton.disabled=true;crateSelect.disabled=true;quick.disabled=true;skipButton.hidden=false;
    pendingCase=C.openCase(crate);reel.innerHTML='';pendingCase.reel.cards.forEach(function(it){reel.appendChild(caseCard(it));});
    var width=144,gap=12,end=C.stopOffset(pendingCase.reel,viewport.clientWidth,width,gap);
    reel.style.transform='translateX('+end+'px)';
    var duration=reduced?0:quick.checked?1000:5200;
    caseAnimation=reel.animate([{transform:'translateX(0px)'},{transform:'translateX('+end+'px)'}],{duration:duration,easing:'cubic-bezier(.12,.72,.13,1)',fill:'forwards'});
    var last=-1;
    function ticks(){if(!busy||!pendingCase)return;var x=new DOMMatrix(getComputedStyle(reel).transform).m41,idx=Math.floor((viewport.clientWidth/2-x)/156);if(idx!==last){tone(false);last=idx;}if(caseAnimation.playState==='running')requestAnimationFrame(ticks);}
    requestAnimationFrame(ticks);
    caseAnimation.onfinish=function(){
      var won=pendingCase.item;
      var centered=C.stopOffset(pendingCase.reel,viewport.clientWidth,144,12);
      caseAnimation.cancel();reel.style.transform='translateX('+centered+'px)';reel.dataset.winner=won.id;
      history=G.record(history,[{id:won.id,name:itemName(won),rarity:won.rarity}],Date.now(),G.HISTORY_LIMIT);syncHistory();persist();tone(true,won.rarity);
      var overlay=h('div',{class:'cx-modal',role:'dialog','aria-modal':'true','aria-label':defaultText('cx.reveal'),style:'--rarity:var(--case-'+won.rarity.toLowerCase()+');--glow:'+(C.rarities.indexOf(won.rarity)+1)},[
        h('div',{class:'cx-prize'},[lbl('cx.reveal'),caseCard(won),h('button',{class:'tpl-btn tpl-btn-accent',text:defaultText('cx.close'),'data-i18n':'cx.close',onclick:closePrize})])]);
      function closePrize(){overlay.remove();openButton.focus();}
      overlay.addEventListener('keydown',function(e){if(e.key==='Escape')closePrize();if(e.key==='Tab'){e.preventDefault();overlay.querySelector('button').focus();}});
      demo.appendChild(overlay);overlay.querySelector('button').focus();
      busy=false;openButton.disabled=false;crateSelect.disabled=false;quick.disabled=false;skipButton.hidden=true;pendingCase=null;
    };
  }
  drawContents();idleReel();

  // ---- record pane: disclosure + history ------------------------------------------

  record.appendChild(h("h3", { text: "Pull history", "data-i18n": "gx.history" }));
  var histList = h("ul", { class: "gx-hist" });
  record.appendChild(histList);
  var clearRow = h("div", { class: "gx-btnrow" });
  clearRow.appendChild(h("button", { class: "tpl-btn tpl-btn-ghost", type: "button", "data-i18n": "gx.clear", text: "Clear", onclick: function () { history = []; persist(); syncHistory(); } }));
  record.appendChild(clearRow);
  var poolOdds = h("div", { class: "gx-odds" });
  var wheelOdds = h("div", { class: "gx-odds" });
  var guarantee = h("p", { class: "gx-note" });
  var rates = h("details", { class: "gx-disclosure gx-rate-details" }, [
    h("summary", {}, [lbl("gx.rates")]), poolOdds, wheelOdds, guarantee, tenNote
  ]);
  record.appendChild(rates);

  function syncGuarantee(node, key, n) {
    node.setAttribute("data-i18n", key);
    node.setAttribute("data-i18n-vars", JSON.stringify({n:n}));
    node.textContent = defaultText(key).replace("{n}", String(n));
  }

  function syncOdds() {
    wheelCost.textContent = String(cfg.currency.single);
    syncGuarantee(tenNote, cfg.pity.sr <= G.MULTI_PULLS ? "gx.tenNote" : "gx.tenNoteOff", cfg.pity.sr);
    syncGuarantee(guarantee, cfg.pity.ssr ? "gx.pityGuarantee" : "gx.ssrPityOff", cfg.pity.ssr);
    renderOdds(poolOdds, cfg.items.map(function (item) {
      return { item: item, odds: G.itemOdds(cfg, item) };
    }));
    renderOdds(wheelOdds, G.wheelSegments(cfg));
  }

  function renderOdds(box, entries) {
    var table = h("table", {});
    var thead = h("thead", {});
    var trh = h("tr", {});
    ["gx.rarity", "gx.item", "gx.odds"].forEach(function (k) {
      trh.appendChild(h("th", { "data-i18n": k, text: defaultText(k), scope: "col" }));
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = h("tbody", {});
    entries.forEach(function (entry) {
      var it = entry.item;
      var tr = h("tr", { class: "r-" + it.rarity });
      tr.appendChild(h("td", { text: it.rarity }));
      tr.appendChild(h("td", { text: itemName(it) }));
      tr.appendChild(h("td", { text: (entry.odds * 100).toFixed(2) + "%" }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.replaceChildren(table);
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
      li.appendChild(h("b", { text: itemName(e.item) }));
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
    drawWheel(wheelWinner);
    persist();
  }

  mode("case");
  root.addEventListener("pixjuice-locale",function(){syncOdds();syncHistory();syncWallet();drawContents();idleReel();drawWheel(wheelWinner);});
  if(location.protocol==='file:'){
    var language=h('select',{'aria-label':'Language',class:'cx-select'});
    ['en','zh','ja','ko','es'].forEach(function(code){language.appendChild(h('option',{value:code,text:{en:'English',zh:'简体中文',ja:'日本語',ko:'한국어',es:'Español'}[code]}));});
    side.prepend(language);
    root.PixI18nRefresh=function(){host.querySelectorAll('[data-i18n]').forEach(function(node){var key=node.getAttribute('data-i18n');node.textContent=defaultText(key);var vars=JSON.parse(node.getAttribute('data-i18n-vars')||'{}');for(var k in vars)node.textContent=node.textContent.replace('{'+k+'}',vars[k]);});};
    language.onchange=function(){document.documentElement.lang=language.value;refreshI18n();root.dispatchEvent(new Event('pixjuice-locale'));};
  }
  restore();
  syncPanel();
  syncOdds();
  syncWallet();
  syncPity();
  syncHistory();
  setSkin(skin);
  new ResizeObserver(function () { drawWheel(wheelWinner); }).observe(wheelCv);
  root.addEventListener("resize", function () { drawWheel(wheelWinner); });
})();
