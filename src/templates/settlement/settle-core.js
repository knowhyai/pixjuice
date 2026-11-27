/* PixJuice Stage Results engine. Vanilla JavaScript, CC0. */
(function (root) {
  "use strict";

  const OUTCOMES = Object.freeze(["victory", "defeat", "clear"]);
  const LOOKS = Object.freeze(["rite", "honor", "report"]);
  const GRADES = Object.freeze(["S", "A", "B", "C", "D"]);
  const ROW_LIMIT = 12;
  const NUMBER_LIMIT = 999999999;

  function integer(value, min, max, fallback = min) {
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;
  }

  function text(value, limit, fallback = "") {
    return typeof value === "string" ? value.trim().slice(0, limit) : fallback;
  }

  function formatDuration(seconds) {
    const total = integer(seconds, 0, NUMBER_LIMIT);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total / 60) % 60;
    const remainder = String(total % 60).padStart(2, "0");
    return hours
      ? hours + ":" + String(minutes).padStart(2, "0") + ":" + remainder
      : String(minutes).padStart(2, "0") + ":" + remainder;
  }

  function gradeFromScore(score) {
    const thresholds = [12000, 9000, 6000, 3000, 0];
    const normalized = integer(score, 0, NUMBER_LIMIT);
    return GRADES[thresholds.findIndex(minimum => normalized >= minimum)];
  }

  const DEFAULT_CONFIG = Object.freeze({
    outcome: "victory",
    look: "rite",
    title: "Ashwood Trial",
    subtitle: "Chapter 3 · Clear",
    grade: "",
    stars: 3,
    starMax: 3,
    score: 12840,
    stats: Object.freeze([
      Object.freeze({ id: "time", label: "Time", value: formatDuration(252) }),
      Object.freeze({ id: "kills", label: "Foes downed", value: 37 }),
      Object.freeze({ id: "hits", label: "Hits taken", value: 2 }),
    ]),
    rewards: Object.freeze([
      Object.freeze({ id: "gold", name: "Gold", count: 250 }),
      Object.freeze({ id: "herb", name: "Ash Herb", count: 3 }),
      Object.freeze({ id: "relic", name: "Trail Relic", count: 1, rarity: "SR" }),
    ]),
  });

  const DEFEAT_CONFIG = Object.freeze({
    ...DEFAULT_CONFIG,
    outcome: "defeat",
    subtitle: "Chapter 3 · Failed",
    stars: 0,
    score: 2400,
    stats: Object.freeze([
      Object.freeze({ ...DEFAULT_CONFIG.stats[0], value: formatDuration(315) }),
      Object.freeze({ ...DEFAULT_CONFIG.stats[1], value: 9 }),
      Object.freeze({ ...DEFAULT_CONFIG.stats[2], value: 12 }),
    ]),
    rewards: Object.freeze([
      Object.freeze({ ...DEFAULT_CONFIG.rewards[0], count: 25 }),
    ]),
  });
  const CLEAR_CONFIG = Object.freeze({ ...DEFAULT_CONFIG, outcome: "clear" });
  const OUTCOME_FIELDS = ["subtitle", "grade", "stars", "score", "stats", "rewards"];

  function outcomePreset(outcome) {
    if (outcome === "defeat") return DEFEAT_CONFIG;
    if (outcome === "clear") return CLEAR_CONFIG;
    return DEFAULT_CONFIG;
  }

  function equalConfigValue(value, preset) {
    if (value === preset) return true;
    if (Array.isArray(preset)) {
      return Array.isArray(value) && value.length === preset.length
        && preset.every((entry, index) => equalConfigValue(value[index], entry));
    }
    if (!isRecord(value) || !isRecord(preset)) return false;
    const keys = Object.keys(preset);
    return Object.keys(value).length === keys.length
      && keys.every(key => Object.hasOwn(value, key) && equalConfigValue(value[key], preset[key]));
  }

  function applyOutcome(config, nextOutcome) {
    const previous = outcomePreset(config.outcome);
    const next = outcomePreset(nextOutcome);
    const updated = { ...config, outcome: next.outcome };
    for (const field of OUTCOME_FIELDS) {
      if (equalConfigValue(config[field], previous[field])) updated[field] = next[field];
    }
    if (next.outcome === "defeat" && config.subtitle === DEFAULT_CONFIG.subtitle) {
      updated.subtitle = next.subtitle;
    }
    return updated;
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function rows(raw, defaults, normalize) {
    const source = Array.isArray(raw) ? raw : defaults;
    return source.slice(0, ROW_LIMIT).filter(isRecord).map(normalize).filter(Boolean);
  }

  function validateConfig(raw = {}) {
    if (!isRecord(raw)) return { ok: false, error: "Expected a results object." };
    const defaults = outcomePreset(raw.outcome);
    const starMax = integer(raw.starMax, 1, 5, defaults.starMax);
    const grade = text(raw.grade, 8).toUpperCase();
    return {
      ok: true,
      config: {
        outcome: defaults.outcome,
        look: LOOKS.includes(raw.look) ? raw.look : defaults.look,
        title: text(raw.title, 64, defaults.title),
        subtitle: text(raw.subtitle, 80, defaults.subtitle),
        grade: GRADES.includes(grade) ? grade : "",
        stars: integer(raw.stars, 0, starMax, Math.min(defaults.stars, starMax)),
        starMax,
        score: integer(raw.score, 0, NUMBER_LIMIT, defaults.score),
        stats: rows(raw.stats, defaults.stats, (row, index) => ({
          id: text(row.id, 32) || "stat-" + (index + 1),
          label: text(row.label, 40),
          value: typeof row.value === "number" ? integer(row.value, -NUMBER_LIMIT, NUMBER_LIMIT) : text(row.value, 40),
        })),
        rewards: rows(raw.rewards, defaults.rewards, (row, index) => {
          if (!Number.isFinite(row.count)) return null;
          const rarity = text(row.rarity, 12);
          return {
            id: text(row.id, 32) || "reward-" + (index + 1),
            name: text(row.name, 40),
            count: integer(row.count, 0, NUMBER_LIMIT),
            ...(rarity ? { rarity } : {}),
          };
        }),
      },
    };
  }

  root.PixSettle = Object.freeze({ OUTCOMES, LOOKS, GRADES, ROW_LIMIT, NUMBER_LIMIT, DEFAULT_CONFIG, outcomePreset, applyOutcome, validateConfig, gradeFromScore, formatDuration });
})(globalThis);
