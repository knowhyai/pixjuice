/* PixJuice save/load template — demo UI (vanilla, zero deps).
   Ships in the ZIP as js/main.js (classic script); the site demo imports this
   same file and only adds localization + the source-code section on top.
   Builds into #app; expects globals PixSave (js/save-core.js) and PixSkins
   (js/skins.js), and styles.css in scope.

   The "game" is a tiny walkable demo (a hero on a grid collecting coins) whose
   only job is to produce meaningful state for the save menu: chapter, level,
   gold, position, playtime. Replace tickGame()/drawGame() with your own game —
   the save menu talks to PixSave only. Dynamic labels carry data-i18n keys with
   English defaults; a host page may define window.PixI18nRefresh(). */

(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis;
  var P = root.PixSave;
  var S = root.PixSkins;
  var host = document.getElementById("app");
  if (!host || !P || !S) return;

  var NS = "pix-tpl-save";          // localStorage namespace for the save slots
  var SETTINGS_KEY = "pix-tpl-save-settings-v2";
  var GAME_KEY = "pix-tpl-save-game";

  // ---- demo game state ---------------------------------------------------------

  var game = P.newGame();
  var coins = [];
  var COLS = 9, ROWS = 6, CELL = 30;
  var lastTick = Date.now();
  var slotsN = 3;
  var autosave = true;
  var AUTOSAVE_SEC = 30;
  var lastAuto = Date.now();
  var skin = "realistic";
  var busy = false;

  var fallbackStorage = P.memoryAdapter();
  function storage() {
    try {
      if (root.localStorage) return root.localStorage;
    } catch (e) { /* private mode */ }
    return fallbackStorage;
  }
  var ls = {
    getItem: function (k) { try { return storage().getItem(k); } catch (e) { return fallbackStorage.getItem(k); } },
    setItem: function (k, v) { try { storage().setItem(k, v); } catch (e) { fallbackStorage.setItem(k, v); } },
    removeItem: function (k) { try { storage().removeItem(k); } catch (e) { fallbackStorage.removeItem(k); } },
  };

  function slotIds() {
    var ids = [];
    for (var i = 1; i <= slotsN; i++) ids.push("s" + i);
    ids.push(P.AUTO_ID);
    return ids;
  }

  function spawnCoins() {
    coins = [];
    while (coins.length < 3) {
      var x = Math.floor(Math.random() * COLS);
      var y = Math.floor(Math.random() * ROWS);
      if ((x !== game.x || y !== game.y) && !coins.some(function (c) { return c.x === x && c.y === y; }))
        coins.push({ x: x, y: y });
    }
  }

  function restore() {
    try {
      var s = JSON.parse(ls.getItem(SETTINGS_KEY) || "null");
      if (s) {
        if (typeof s.slotsN === "number" && s.slotsN >= 1 && s.slotsN <= 6) slotsN = s.slotsN;
        if (typeof s.autosave === "boolean") autosave = s.autosave;
        if (S.isSkin(s.skin)) skin = s.skin;
      }
      var g = P.sanitize(JSON.parse(ls.getItem(GAME_KEY) || "null"));
      if (g) game = g;
    } catch (e) { /* fresh start */ }
    if (!coins.length) spawnCoins();
  }
  function persistGame() { ls.setItem(GAME_KEY, JSON.stringify(game)); }
  function persistSettings() {
    ls.setItem(SETTINGS_KEY, JSON.stringify({ slotsN: slotsN, autosave: autosave, skin: skin }));
  }

  // ---- dom helper ----------------------------------------------------------------

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
  var EN = {
    "sv.game": "Demo game", "sv.hint": "Move with WASD / arrows or the pad, collect coins — then save, load, export and import.",
    "sv.chapter": "Chapter", "sv.level": "Level", "sv.gold": "Gold", "sv.playtime": "Playtime",
    "sv.slots": "Save slots", "sv.autoSlot": "Auto-save", "sv.empty": "Empty", "sv.autoBadge": "Auto",
    "sv.new": "New game", "sv.save": "Save", "sv.load": "Load", "sv.del": "Delete", "sv.export": "Export",
    "sv.import": "Import save file", "sv.saveHere": "Save here",
    "sv.confirmDel": "Delete this save? This cannot be undone.",
    "sv.confirmOver": "Overwrite this save?", "sv.confirmLoad": "Load this save? Unsaved progress will be lost.",
    "sv.confirmNew": "Start a new game? Current progress is not saved to a slot.",
    "sv.confirm": "Confirm", "sv.cancel": "Cancel",
    "sv.saveTo": "Save to which slot?", "sv.importTo": "Import into which slot?",
    "sv.saved": "Saved.", "sv.loaded": "Save loaded.", "sv.deleted": "Save deleted.",
    "sv.exported": "Save exported.", "sv.imported": "Save imported.", "sv.importBad": "Not a valid save file.",
    "sv.settings": "Settings", "sv.slotsCfg": "Slot count", "sv.autosave": "Auto-save every 30 s",
    "sv.reset": "Reset demo", "sv.resetDone": "Demo reset.", "sv.autosaved": "Auto-saved.",
    "sv.up": "Up", "sv.down": "Down", "sv.left": "Left", "sv.right": "Right",
    "sv.heroAria": "Game preview",
    "tpl.skin": "Skin", "tpl.skin.realistic": "Semi-Realistic", "tpl.skin.stylized": "Stylized",
    "tpl.skin.lowpoly": "Clean Low Poly", "tpl.skin.pixel": "Pixel Art",
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
    setTimeout(function () { el.classList.remove("on"); setTimeout(function () { el.remove(); }, 350); }, 2400);
  }

  // ---- layout ----------------------------------------------------------------------

  host.innerHTML = "";
  var demo = h("div", { class: "tpl-demo sv-demo", "data-skin": skin });
  var side = h("aside", { class: "tpl-side" });
  var stage = h("section", { class: "tpl-stage" });
  demo.appendChild(side);
  demo.appendChild(stage);
  host.appendChild(demo);

  // ---- side panel ---------------------------------------------------------------------

  side.appendChild(h("h3", { text: "Settings", "data-i18n": "sv.settings" }));
  var skinRow = h("div", { class: "gx-skins", role: "group" });



  side.appendChild(h("h4", { text: "Slot count", "data-i18n": "sv.slotsCfg" }));
  var slotsRow = h("label", { class: "gx-slider" });
  var slotsInput = h("input", { type: "range", min: "1", max: "6", step: "1", "aria-label": "Slot count" });
  var slotsOut = h("output", {});
  slotsRow.appendChild(slotsInput);
  slotsRow.appendChild(slotsOut);
  side.appendChild(slotsRow);
  slotsInput.addEventListener("input", function () {
    slotsN = Number(slotsInput.value);
    slotsOut.textContent = String(slotsN);
    persistSettings();
    renderSlots();
  });

  var autoRow = h("label", { class: "sv-autorow" });
  var autoInput = h("input", { type: "checkbox" });
  autoRow.appendChild(autoInput);
  autoRow.appendChild(h("span", { "data-i18n": "sv.autosave", text: "Auto-save every 30 s" }));
  side.appendChild(autoRow);
  autoInput.addEventListener("change", function () {
    autosave = autoInput.checked;
    lastAuto = Date.now();
    persistSettings();
  });

  side.appendChild(h("p", { class: "gx-note", "data-i18n": "sv.hint", text: "Move with WASD / arrows or the pad, collect coins — then save, load, export and import." }));

  var sideBtns = h("div", { class: "gx-btnrow" });
  sideBtns.appendChild(h("button", { class: "tpl-btn", type: "button", "data-i18n": "sv.new", text: "New game", onclick: function () { confirmModal("sv.confirmNew", function () { game = P.newGame(); spawnCoins(); persistGame(); syncHud(); drawGame(); }); } }));
  var impFile = h("input", { type: "file", accept: ".json,application/json", class: "sv-file", "aria-label": "Import save file" });
  impFile.addEventListener("change", function () {
    var f = impFile.files && impFile.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      var res = P.parseImport(String(fr.result));
      if (!res.ok) return say("sv.importBad");
      slotPicker("sv.importTo", function (slotId) {
        var entry = Object.assign({}, res.entry, { slot: slotId, auto: slotId === P.AUTO_ID });
        var apply = function () { P.write(ls, NS, entry); renderSlots(); say("sv.imported"); };
        if (P.read(ls, NS, slotId)) confirmModal("sv.confirmOver", apply); else apply();
      });
    };
    fr.readAsText(f);
    impFile.value = "";
  });
  sideBtns.appendChild(impFile);
  sideBtns.appendChild(h("button", { class: "tpl-btn", type: "button", "data-i18n": "sv.import", text: "Import save file", onclick: function () { impFile.click(); } }));
  sideBtns.appendChild(h("button", { class: "tpl-btn tpl-btn-ghost", type: "button", "data-i18n": "sv.reset", text: "Reset demo", onclick: function () {
    ["s1","s2","s3","s4","s5","s6",P.AUTO_ID].forEach(function (id) { P.remove(ls, NS, id); });
    ls.removeItem(GAME_KEY);
    ls.removeItem(SETTINGS_KEY);
    game = P.newGame();
    spawnCoins();
    lastAuto = Date.now();
    persistGame();
    syncHud();
    renderSlots();
    drawGame();
    say("sv.resetDone");
  } }));
  side.appendChild(sideBtns);

  // ---- stage: game ---------------------------------------------------------------------

  stage.appendChild(h("h3", { text: "Demo game", "data-i18n": "sv.game" }));
  var hud = h("div", { class: "sv-hud" });
  var hudChapter = h("span", {});
  var hudLevel = h("span", {});
  var hudGold = h("span", {});
  var hudTime = h("span", {});
  hud.appendChild(hudChapter);
  hud.appendChild(hudLevel);
  hud.appendChild(hudGold);
  hud.appendChild(hudTime);
  stage.appendChild(hud);

  var gameWrap = h("div", { class: "sv-game" });
  var cv = h("canvas", { width: String(COLS * CELL), height: String(ROWS * CELL), "aria-label": "Game preview" });
  gameWrap.appendChild(cv);
  var pad = h("div", { class: "sv-pad", "aria-label": "Movement" });
  var padBtns = {};
  [["up", "▲", 0, -1], ["left", "◀", -1, 0], ["right", "▶", 1, 0], ["down", "▼", 0, 1]].forEach(function (d) {
    var b = h("button", {
      class: "sv-pad-btn sv-pad-" + d[0], type: "button", "aria-label": defaultText("sv." + d[0]),
      "data-i18n-aria": "sv." + d[0], text: d[1],
      onclick: function () { step(d[2], d[3]); },
    });
    padBtns[d[0]] = b;
    pad.appendChild(b);
  });
  gameWrap.appendChild(pad);
  stage.appendChild(gameWrap);

  var KEYS = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] };
  var lastStep = 0;
  root.addEventListener("keydown", function (e) {
    if (busy || !KEYS[e.key] || (e.target && /input|textarea|select/i.test(e.target.tagName || ""))) return;
    e.preventDefault();
    var now = Date.now();
    if (now - lastStep < 110) return;
    lastStep = now;
    step(KEYS[e.key][0], KEYS[e.key][1]);
  });

  function step(dx, dy) {
    if (busy) return;
    game.x = Math.max(0, Math.min(COLS - 1, game.x + dx));
    game.y = Math.max(0, Math.min(ROWS - 1, game.y + dy));
    for (var i = coins.length - 1; i >= 0; i--) {
      if (coins[i].x === game.x && coins[i].y === game.y) {
        coins.splice(i, 1);
        game.gold += 10;
        spawnCoins();
      }
    }
    game.level = 1 + Math.floor(game.gold / 50);
    game.chapter = 1 + Math.floor(game.gold / 150);
    persistGame();
    syncHud();
    drawGame();
  }

  function syncHud() {
    hudChapter.textContent = defaultText("sv.chapter") + " " + game.chapter;
    hudLevel.textContent = defaultText("sv.level") + " " + game.level;
    hudGold.textContent = defaultText("sv.gold") + " " + game.gold;
    hudTime.textContent = defaultText("sv.playtime") + " " + P.formatPlaytime(game.playtime);
  }

  function skinVar(name, fallback) {
    var v = getComputedStyle(demo).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawGame() {
    var ctx = cv.getContext("2d");
    var pixel = skin === "pixel-art";
    ctx.imageSmoothingEnabled = !pixel;
    var w = cv.width, ht = cv.height;
    // Stone flags with irregular seams, worn edges and dust. Deterministic so
    // snapshots preserve the same world after a save/load round trip.
    ctx.fillStyle = "#161e21"; ctx.fillRect(0,0,w,ht);
    for (var y=0;y<ROWS;y++) for(var x=0;x<COLS;x++) {
      var tone=28+((x*17+y*31)%17), px=x*CELL, py=y*CELL;
      ctx.fillStyle="rgb("+tone+","+(tone+6)+","+(tone+7)+")";
      ctx.fillRect(px+1,py+1,CELL-2,CELL-2);
      ctx.strokeStyle="#73807824";ctx.strokeRect(px+2,py+2,CELL-4,CELL-4);
      ctx.fillStyle="#00000030";ctx.fillRect(px+3,py+CELL-4,CELL-6,2);
      ctx.strokeStyle="#101819";ctx.beginPath();ctx.moveTo(px+8,py+3);ctx.lineTo(px+12,py+8);ctx.lineTo(px+10,py+13);ctx.stroke();
      ctx.fillStyle="#9b9b7920";for(var d=0;d<5;d++)ctx.fillRect(px+(d*13+x*7)%28,py+(d*7+y*11)%28,1,1);
    }
    // Deep masonry arch along the north wall and side buttresses.
    var wall=ctx.createLinearGradient(0,0,0,35);wall.addColorStop(0,"#070e13");wall.addColorStop(1,"#303a3b");
    ctx.fillStyle=wall;ctx.fillRect(0,0,w,25);
    for(var bx=0;bx<w;bx+=42){ctx.strokeStyle="#59626255";ctx.strokeRect(bx+1,2,39,20);}
    ctx.fillStyle="#080e13";ctx.beginPath();ctx.moveTo(w/2-22,26);ctx.lineTo(w/2-22,13);ctx.quadraticCurveTo(w/2, -8,w/2+22,13);ctx.lineTo(w/2+22,26);ctx.fill();
    for(var sideX of [3,w-14])for(var by=32;by<ht;by+=54){ctx.fillStyle="#11191c";ctx.fillRect(sideX,by,11,35);ctx.fillStyle="#56605a";ctx.fillRect(sideX,by,11,3);}
    // Lanterns cast warm pools over the cool stone without concealing the map.
    for(var lamp of [[32,40],[w-32,ht-34]]){
      var light=ctx.createRadialGradient(lamp[0],lamp[1],1,lamp[0],lamp[1],95);
      light.addColorStop(0,"#d3a26565");light.addColorStop(.35,"#aa784c28");light.addColorStop(1,"#a97e4900");ctx.fillStyle=light;ctx.fillRect(0,0,w,ht);
      ctx.fillStyle="#080d11";ctx.fillRect(lamp[0]-5,lamp[1]-7,10,16);
      ctx.fillStyle="#c8ac78";ctx.fillRect(lamp[0]-2,lamp[1]-4,4,9);ctx.fillStyle="#f4dcab";ctx.fillRect(lamp[0]-1,lamp[1]-2,2,4);
    }
    // Small metal coins, with a restrained highlight and grounded shadows.
    for(var c=0;c<coins.length;c++){
      var cx=coins[c].x*CELL+CELL/2,cy=coins[c].y*CELL+CELL/2;
      ctx.fillStyle="#0007";ctx.beginPath();ctx.ellipse(cx+2,cy+3,7,3,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#807453";ctx.beginPath();ctx.ellipse(cx,cy,5,3.5,-.4,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#c1b18a";ctx.lineWidth=1;ctx.stroke();ctx.fillStyle="#d6c7a2";ctx.fillRect(cx-2,cy-2,2,1);
    }
    // Cloaked explorer silhouette, hood, shoulder armor and a narrow sword.
    var hx=game.x*CELL+CELL/2,hy=game.y*CELL+CELL/2;
    ctx.fillStyle="#0009";ctx.beginPath();ctx.ellipse(hx+2,hy+10,12,5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#0c131b";ctx.beginPath();ctx.moveTo(hx,hy-9);ctx.lineTo(hx-11,hy+10);ctx.lineTo(hx+9,hy+11);ctx.closePath();ctx.fill();
    ctx.fillStyle="#45555b";ctx.beginPath();ctx.moveTo(hx,hy-8);ctx.lineTo(hx-8,hy+8);ctx.lineTo(hx-2,hy+5);ctx.closePath();ctx.fill();
    ctx.fillStyle="#626d69";ctx.fillRect(hx-8,hy-4,5,3);ctx.fillStyle="#111a20";ctx.beginPath();ctx.arc(hx,hy-9,5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#899796";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hx+7,hy+2);ctx.lineTo(hx+12,hy-10);ctx.stroke();
    ctx.fillStyle="#9b8b66";ctx.fillRect(hx+5,hy+1,6,2);
    var shade=ctx.createRadialGradient(w/2,ht/2,30,w/2,ht/2,w*.6);shade.addColorStop(0,"#0000");shade.addColorStop(1,"#000a");ctx.fillStyle=shade;ctx.fillRect(0,0,w,ht);
    ctx.strokeStyle="#7c806155";ctx.lineWidth=1;ctx.strokeRect(1,1,w-2,ht-2);
  }

  /** Small snapshot for save thumbnails. */
  function makeThumb() {
    var t = document.createElement("canvas");
    t.width = 120;
    t.height = 80;
    var tc = t.getContext("2d");
    tc.drawImage(cv, 0, 0, t.width, t.height);
    return t.toDataURL("image/png");
  }

  // ---- slots -----------------------------------------------------------------------------

  stage.appendChild(h("h3", { text: "Save slots", "data-i18n": "sv.slots" }));
  var slotsGrid = h("div", { class: "sv-slots" });
  stage.appendChild(slotsGrid);

  function renderSlots() {
    slotsGrid.innerHTML = "";
    var entries = P.list(ls, NS, slotIds());
    slotIds().forEach(function (id) {
      var e = entries[id];
      var auto = id === P.AUTO_ID;
      var card = h("div", { class: "sv-slot" + (auto ? " sv-slot-auto" : "") + (e ? " sv-slot-filled" : "") });
      var head = h("div", { class: "sv-slot-head" });
      head.appendChild(h("b", { text: auto ? defaultText("sv.autoSlot") : defaultText("sv.save") + " " + id.slice(1) }));
      if (auto) head.appendChild(h("span", { class: "tpl-badge", "data-i18n": "sv.autoBadge", text: "Auto" }));
      card.appendChild(head);

      if (!e) {
        card.appendChild(h("p", { class: "sv-slot-empty", "data-i18n": "sv.empty", text: "Empty" }));
        card.appendChild(h("button", { class: "tpl-btn tpl-btn-accent", type: "button", "data-i18n": "sv.saveHere", text: "Save here", onclick: function () { writeSlot(id, false); } }));
        slotsGrid.appendChild(card);
        return;
      }

      var body = h("div", { class: "sv-slot-body" });
      if (e.thumb) body.appendChild(h("img", { class: "sv-thumb pix-crisp", src: e.thumb, alt: "" }));
      else body.appendChild(h("div", { class: "sv-thumb sv-thumb-none", "aria-hidden": "true" }));
      var meta = h("div", { class: "sv-slot-meta" });
      meta.appendChild(h("b", { text: e.name }));
      meta.appendChild(h("span", { text: defaultText("sv.chapter") + " " + e.chapter + " · " + defaultText("sv.level") + " " + e.level }));
      meta.appendChild(h("span", { text: defaultText("sv.gold") + " " + e.gold + " · " + defaultText("sv.playtime") + " " + P.formatPlaytime(e.playtime) }));
      meta.appendChild(h("time", { text: e.ts ? new Date(e.ts).toLocaleString() : "—" }));
      body.appendChild(meta);
      card.appendChild(body);

      var actions = h("div", { class: "sv-slot-actions" });
      actions.appendChild(h("button", { class: "tpl-btn", type: "button", "data-i18n": "sv.save", text: "Save", onclick: function () { writeSlot(id, true); } }));
      actions.appendChild(h("button", { class: "tpl-btn", type: "button", "data-i18n": "sv.load", text: "Load", onclick: function () { confirmModal("sv.confirmLoad", function () {
        var loaded = P.read(ls, NS, id);
        if (!loaded) return say("sv.importBad");
        game = loaded;
        spawnCoins();
        persistGame();
        syncHud();
        drawGame();
        say("sv.loaded");
      }); } }));
      actions.appendChild(h("button", { class: "tpl-btn", type: "button", "data-i18n": "sv.export", text: "Export", onclick: function () {
        var entry = P.read(ls, NS, id);
        if (!entry) return say("sv.importBad");
        saveBlob(new Blob([P.exportText(entry)], { type: "application/json" }), "pixjuice-save-" + id + ".json");
        say("sv.exported");
      } }));
      actions.appendChild(h("button", { class: "tpl-btn tpl-btn-ghost sv-danger", type: "button", "data-i18n": "sv.del", text: "Delete", onclick: function () { confirmModal("sv.confirmDel", function () { P.remove(ls, NS, id); renderSlots(); say("sv.deleted"); }); } }));
      card.appendChild(actions);
      slotsGrid.appendChild(card);
    });
    refreshI18n();
  }

  function writeSlot(id, confirmOverwrite) {
    var writeIt = function () {
      var entry = Object.assign({}, game, { slot: id, thumb: makeThumb(), auto: id === P.AUTO_ID });
      P.write(ls, NS, entry);
      renderSlots();
      say("sv.saved");
    };
    if (confirmOverwrite && P.read(ls, NS, id)) confirmModal("sv.confirmOver", writeIt);
    else writeIt();
  }

  // ---- modal -------------------------------------------------------------------------------

  function confirmModal(keyText, onOk) {
    busy = true;
    var overlay = h("div", { class: "tpl-modal", role: "dialog", "aria-modal": "true" });
    var box = h("div", { class: "tpl-modal-box" });
    box.appendChild(h("h3", { "data-i18n": keyText, text: defaultText(keyText) }));
    var actions = h("div", { class: "tpl-modal-actions" });
    actions.appendChild(h("button", { class: "tpl-btn tpl-btn-ghost", type: "button", "data-i18n": "sv.cancel", text: "Cancel", onclick: close }));
    actions.appendChild(h("button", { class: "tpl-btn tpl-btn-accent", type: "button", "data-i18n": "sv.confirm", text: "Confirm", onclick: function () { close(); onOk(); } }));
    box.appendChild(actions);
    overlay.appendChild(box);
    demo.appendChild(overlay);
    refreshI18n();
    var previousFocus = document.activeElement;
    overlay.querySelector("button").focus();
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key !== "Tab") return;
      var buttons = Array.from(overlay.querySelectorAll("button"));
      var index = buttons.indexOf(document.activeElement);
      e.preventDefault();
      buttons[(index + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
    });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", esc, true);
    function esc(e) { if (e.key === "Escape") { close(); } }
    function close() {
      busy = false;
      document.removeEventListener("keydown", esc, true);
      overlay.remove();
      if (previousFocus) previousFocus.focus();
    }
  }

  function slotPicker(keyText, onPick) {
    busy = true;
    var overlay = h("div", { class: "tpl-modal", role: "dialog", "aria-modal": "true" });
    var box = h("div", { class: "tpl-modal-box" });
    box.appendChild(h("h3", { "data-i18n": keyText, text: defaultText(keyText) }));
    var row = h("div", { class: "tpl-modal-slots" });
    slotIds().forEach(function (id) {
      row.appendChild(h("button", { class: "tpl-btn", type: "button", text: id === P.AUTO_ID ? defaultText("sv.autoSlot") : defaultText("sv.save") + " " + id.slice(1), onclick: function () { close(); onPick(id); } }));
    });
    box.appendChild(row);
    var actions = h("div", { class: "tpl-modal-actions" });
    actions.appendChild(h("button", { class: "tpl-btn tpl-btn-ghost", type: "button", "data-i18n": "sv.cancel", text: "Cancel", onclick: close }));
    box.appendChild(actions);
    overlay.appendChild(box);
    demo.appendChild(overlay);
    refreshI18n();
    var previousFocus = document.activeElement;
    overlay.querySelector("button").focus();
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key !== "Tab") return;
      var buttons = Array.from(overlay.querySelectorAll("button"));
      var index = buttons.indexOf(document.activeElement);
      e.preventDefault();
      buttons[(index + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
    });
    function close() { busy = false; overlay.remove(); if (previousFocus) previousFocus.focus(); }
  }

  function saveBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---- loops --------------------------------------------------------------------------------

  setInterval(function () {
    var now = Date.now();
    var dt = now - lastTick;
    lastTick = now;
    if (dt > 5000) return; // tab slept — don't inflate playtime
    game.playtime += Math.round(dt / 1000);
    syncHud();
    if (autosave && now - lastAuto >= AUTOSAVE_SEC * 1000) {
      lastAuto = now;
      P.write(ls, NS, Object.assign({}, game, { slot: P.AUTO_ID, thumb: makeThumb(), auto: true }));
      renderSlots();
      say("sv.autosaved");
    }
  }, 1000);

  function setSkin(s) {
    if (!S.isSkin(s)) return;
    skin = s;
    demo.setAttribute("data-skin", s);
    Array.prototype.forEach.call(skinRow.children, function (b) {
      b.classList.toggle("on", b.getAttribute("data-skin-id") === s);
    });
    persistSettings();
    drawGame();
  }

  // ---- boot -----------------------------------------------------------------------------------

  restore();
  slotsInput.value = String(slotsN);
  slotsOut.textContent = String(slotsN);
  autoInput.checked = autosave;
  syncHud();
  renderSlots();
  setSkin(skin);
  drawGame();
  root.addEventListener("pixjuice-locale", function () { syncHud(); renderSlots(); });
})();
