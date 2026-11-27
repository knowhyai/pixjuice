/* PixJuice Stage Results demo. The standalone page and site share this UI. */
(function () {
  "use strict";

  const P = window.PixSettle;
  const host = document.getElementById("app");
  if (!host || !P) return;

  const key = "pix-tpl-settlement-v2";
  const legacyKey = "pix-tpl-settlement-v1";
  const defaults = P.DEFAULT_CONFIG;
  const defeat = P.outcomePreset("defeat");
  let config = P.validateConfig().config;
  let migrateDefeat = false;
  try {
    const stored = localStorage.getItem(key);
    const saved = P.validateConfig(JSON.parse(stored ?? localStorage.getItem(legacyKey)));
    if (saved.ok) {
      config = saved.config;
      migrateDefeat = stored === null && config.outcome === "defeat";
    }
  } catch {
    // An unavailable store or invalid JSON starts a fresh session.
  }

  function t(name) {
    const lookup = "se." + name;
    if (window.PixTranslate) return window.PixTranslate(lookup);
    const language = document.documentElement.lang;
    return window.PixStrings[language]?.[lookup] ?? window.PixStrings.en[lookup];
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, action, accent = false) {
    const node = el("button", accent ? "tpl-btn tpl-btn-accent" : "tpl-btn", t(label));
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }

  const demo = el("div", "tpl-demo se-demo");
  demo.dataset.skin = window.PixSkins.SKINS[0];
  const stage = el("section", "tpl-stage");
  const reveal = el("div", "se-reveal");
  const actions = el("div", "se-actions");
  const status = el("p", "se-status");
  status.setAttribute("role", "status");
  const side = el("aside", "tpl-side");
  stage.append(reveal, actions, status);
  demo.append(stage, side);
  host.replaceChildren(demo);

  function sample(value, original, name) {
    return value === original ? t("sample." + name) : value;
  }

  function number(value) {
    return typeof value === "number" ? value.toLocaleString(document.documentElement.lang) : value;
  }

  function metric(label, value) {
    const tile = el("div", "se-metric");
    tile.append(el("b", "", number(value)), el("span", "", label));
    return tile;
  }

  function renderStage(animate = false) {
    stage.dataset.outcome = config.outcome;
    const banner = el("header", "se-banner");
    const subtitle = config.subtitle === defeat.subtitle
      ? sample(config.subtitle, defeat.subtitle, "subtitleDefeat")
      : sample(config.subtitle, defaults.subtitle, "subtitle");
    banner.append(
      el("h2", "", t(config.outcome)),
      el("p", "se-title", sample(config.title, defaults.title, "title")),
      el("p", "se-subtitle", subtitle),
    );

    const rating = el("div", "se-rating");
    const grade = config.grade || P.gradeFromScore(config.score);
    const crest = el("strong", "se-grade", grade);
    crest.setAttribute("aria-label", t("grade") + " " + grade);
    const stars = el("span", "se-stars", "★".repeat(config.stars) + "☆".repeat(config.starMax - config.stars));
    stars.setAttribute("role", "img");
    stars.setAttribute("aria-label", t("stars") + " " + config.stars + " / " + config.starMax);
    rating.append(crest, stars);

    const stats = el("div", "se-stats");
    stats.setAttribute("role", "region");
    stats.setAttribute("aria-label", t("stats"));
    stats.tabIndex = 0;
    for (const [index, row] of config.stats.entries()) {
      if (index === 3) stats.append(metric(t("score"), config.score));
      const original = defaults.stats.find(stat => stat.id === row.id);
      stats.append(metric(sample(row.label, original?.label, row.id), row.value));
    }
    if (config.stats.length <= 3) stats.append(metric(t("score"), config.score));

    const loot = el("section", "se-loot");
    const rewards = el("div", "se-rewards");
    rewards.setAttribute("role", "region");
    rewards.setAttribute("aria-label", t("rewards"));
    rewards.tabIndex = config.rewards.length ? 0 : -1;
    for (const [index, row] of config.rewards.entries()) {
      const item = el("div", "se-reward");
      item.style.setProperty("--order", Math.min(index, 4));
      const original = defaults.rewards.find(reward => reward.id === row.id);
      item.append(el("strong", "", sample(row.name, original?.name, row.id)), el("span", "se-count", "×" + number(row.count)));
      if (row.rarity) item.append(el("small", "", row.rarity));
      rewards.append(item);
    }
    if (!config.rewards.length) rewards.append(el("p", "se-empty", t("noRewards")));
    loot.append(el("h3", "", t("rewards")), rewards);

    const frame = el("div", animate ? "se-frame se-animate" : "se-frame");
    frame.append(banner, rating, stats, loot);
    reveal.replaceChildren(frame);
  }

  function announce(message) {
    status.textContent = t(message);
  }

  function renderActions() {
    const failed = config.outcome === "defeat";
    actions.replaceChildren(
      button("retry", () => { renderStage(true); announce("retried"); }, failed),
      button("continue", () => announce("continued"), !failed),
      button("return", () => announce("returned")),
    );
  }

  function commit(raw, animate = false) {
    const result = P.validateConfig(raw);
    if (!result.ok) return false;
    config = result.config;
    status.textContent = "";
    try {
      localStorage.setItem(key, JSON.stringify(config));
    } catch {
      announce("storageUnavailable");
    }
    renderStage(animate);
    renderActions();
    return true;
  }

  function field(label, value, update, options = {}) {
    const wrap = el("label", "se-field");
    const input = el(options.choices ? "select" : "input");
    if (options.choices) {
      for (const [id, name] of options.choices) input.add(new Option(name, id));
    } else if (options.maxLength) {
      input.maxLength = options.maxLength;
    } else {
      input.type = "number";
      input.min = String(options.min ?? 0);
      input.max = String(options.max ?? P.NUMBER_LIMIT);
    }
    input.value = value;
    let committedValue = value;
    input.addEventListener("input", () => {
      if (input.type !== "number" || input.value !== "") {
        committedValue = update(input.type === "number" ? input.valueAsNumber : input.value);
      }
    });
    if (input.type === "number") input.addEventListener("blur", () => {
      if (input.value === "" || !input.validity.valid) input.value = Math.min(Number(input.max), committedValue);
    });
    wrap.append(el("span", "", t(label)), input);
    return wrap;
  }

  function editList(name, fields, blank) {
    const group = el("fieldset", "se-list");
    const items = el("div", "se-rows");
    const add = button(name === "stats" ? "addStat" : "addReward", () => {
      commit({ ...config, [name]: [...config[name], blank] });
      populate();
      items.lastElementChild?.querySelector("input")?.focus();
    });
    group.append(el("legend", "", t(name)), items, add);

    function populate() {
      items.replaceChildren();
      config[name].forEach((row, index) => {
        const item = el("div", "se-editor-row");
        for (const [property, options] of fields) {
          item.append(field(property, row[property] ?? "", value => {
            const edited = config[name].map((entry, i) => i === index ? { ...entry, [property]: value } : entry);
            commit({ ...config, [name]: edited });
            return config[name][index][property];
          }, options));
        }
        const remove = button("remove", () => {
          commit({ ...config, [name]: config[name].filter((_, i) => i !== index) });
          populate();
          (items.children[index]?.querySelector("input") ?? add).focus();
        });
        remove.setAttribute("aria-label", t("remove") + " · " + t(name) + " " + (index + 1));
        item.append(remove);
        items.append(item);
      });
      add.disabled = config[name].length >= P.ROW_LIMIT;
    }
    populate();
    return group;
  }

  function exportConfig() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }));
    const link = el("a");
    link.href = url;
    link.download = "pixjuice-settlement.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderEditor() {
    const files = el("div", "se-actions");
    const file = el("input");
    file.type = "file";
    file.accept = ".json,application/json";
    file.hidden = true;
    file.addEventListener("change", async () => {
      const selected = file.files[0];
      file.value = "";
      if (!selected) return;
      try {
        if (selected.size > 128 * 1024 || !commit(JSON.parse(await selected.text()))) {
          announce("invalid");
          return;
        }
        renderEditor();
        side.querySelector("select")?.focus();
        if (!status.textContent) announce("imported");
      } catch {
        announce("invalid");
      }
    });
    files.append(button("export", exportConfig), button("import", () => file.click()), file);

    const update = property => value => {
      commit({ ...config, [property]: value });
      return config[property];
    };
    const settings = el("div", "se-settings");
    const stars = field("stars", config.stars, update("stars"), { max: config.starMax });
    const starInput = stars.querySelector("input");
    const max = field("starMax", config.starMax, value => {
      update("starMax")(value);
      starInput.max = config.starMax;
      starInput.value = config.stars;
      return config.starMax;
    }, { min: 1, max: 5 });
    settings.append(
      field("outcome", config.outcome, value => {
        commit(P.applyOutcome(config, value));
        renderEditor();
        side.querySelector("select")?.focus();
        return config.outcome;
      }, { choices: P.OUTCOMES.map(value => [value, t(value)]) }),
      field("grade", config.grade, update("grade"), { choices: [["", t("auto")], ...P.GRADES.map(value => [value, value])] }),
      field("title", config.title, update("title"), { maxLength: 64 }),
      field("subtitle", config.subtitle, update("subtitle"), { maxLength: 80 }),
      stars, max,
      field("score", config.score, update("score")),
    );
    side.replaceChildren(
      el("h3", "", t("editor")), files, settings,
      editList("stats", [["label", { maxLength: 40 }], ["value", { maxLength: 40 }]], { label: "", value: "" }),
      editList("rewards", [["name", { maxLength: 40 }], ["count", {}], ["rarity", { maxLength: 12 }]], { name: "", count: 1 }),
    );
  }

  window.addEventListener("pixjuice-locale", () => {
    renderStage();
    renderActions();
    renderEditor();
  });
  if (migrateDefeat) {
    commit(P.applyOutcome({ ...config, outcome: "victory" }, "defeat"), true);
  } else {
    renderStage(true);
    renderActions();
  }
  renderEditor();
})();
