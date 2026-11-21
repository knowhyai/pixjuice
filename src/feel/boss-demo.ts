// The /feel/boss-hp/ demo: a live boss health bar driven purely by DOM + rAF.
// Five juice layers stack on one HP model — delayed white bar, hit shake +
// flash, scale ticks, layered HP colors with a ×N badge, low-HP alarm with a
// red screen edge that stays inside the demo stage. All timing state is a
// small machine updated every frame, so repeated hits, layer crossings in
// both directions, resets and live parameter edits can't desync it.

import { BOSS_LAYER_COLORS, type BossHpParams } from "./boss-params";

export interface BossBarDemo {
  setParams(p: BossHpParams): void;
  damage(units: number): void;
  heal(units: number): void;
  reset(): void;
  dispose(): void;
}

const HIT_UNITS = 100; // one layer = 100 units; the bar shows the active layer's %

const rmQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export function createBossBar(host: HTMLElement, initialParams: BossHpParams): BossBarDemo {
  let params = initialParams;
  const layerCount = () => (params.layers.on ? Math.round(params.layers.count) : 1);

  // --- hp model ------------------------------------------------------------------
  let layerTotal = layerCount();
  let hp = layerTotal * HIT_UNITS; // total remaining HP across all layers
  const total = () => layerTotal * HIT_UNITS;
  const activeLayer = () => (hp <= 0 ? 0 : Math.min(layerTotal, Math.ceil(hp / HIT_UNITS)));
  const layerPct = () => {
    if (hp <= 0) return 0;
    const layer = activeLayer();
    if (layer <= 0) return 0;
    return ((hp - (layer - 1) * HIT_UNITS) / HIT_UNITS) * 100;
  };
  const layerColor = (): string => {
    if (!params.layers.on) return "#ff4d5e"; // a single-layer boss bar reads as plain red
    return BOSS_LAYER_COLORS[Math.min(layerTotal - activeLayer(), BOSS_LAYER_COLORS.length - 1)];
  };

  // --- DOM -----------------------------------------------------------------------
  const stage = document.createElement("div");
  stage.className = "feel-boss-stage";
  const edge = document.createElement("div");
  edge.className = "feel-boss-edge";
  edge.setAttribute("aria-hidden", "true");
  const barZone = document.createElement("div");
  barZone.className = "feel-boss-zone"; // the element that shakes
  const nameRow = document.createElement("div");
  nameRow.className = "feel-boss-name";
  const nameTag = document.createElement("span");
  nameTag.className = "feel-boss-tag";
  nameTag.textContent = "BOSS";
  const badge = document.createElement("span");
  badge.className = "feel-boss-badge";
  nameRow.append(nameTag, badge);
  const barTrack = document.createElement("div");
  barTrack.className = "feel-boss-track";
  barTrack.setAttribute("role", "progressbar");
  barTrack.setAttribute("aria-valuemin", "0");
  barTrack.setAttribute("aria-valuemax", "100");
  const lagFill = document.createElement("div");
  lagFill.className = "feel-boss-lag";
  const fill = document.createElement("div");
  fill.className = "feel-boss-fill";
  const flashOverlay = document.createElement("div");
  flashOverlay.className = "feel-boss-flash";
  flashOverlay.setAttribute("aria-hidden", "true");
  const tickLayer = document.createElement("div");
  tickLayer.className = "feel-boss-ticks";
  tickLayer.setAttribute("aria-hidden", "true");
  barTrack.append(lagFill, fill, tickLayer, flashOverlay);
  const glow = document.createElement("div");
  glow.className = "feel-boss-glow";
  glow.setAttribute("aria-hidden", "true");
  barZone.append(nameRow, glow, barTrack);
  stage.append(edge, barZone);
  host.append(stage);

  // --- ticks (rebuilt on live edits) ---------------------------------------------
  function renderTicks(): void {
    tickLayer.replaceChildren();
    if (!params.ticks.on) return;
    const step = Math.round(params.ticks.step);
    for (let p = step; p < 100; p += step) {
      const line = document.createElement("i");
      line.className = "feel-boss-tick";
      line.style.left = `${p}%`;
      tickLayer.append(line);
    }
    if (params.ticks.markers) {
      for (const p of [25, 50, 75]) {
        const mark = document.createElement("i");
        mark.className = "feel-boss-mark";
        mark.style.left = `${p}%`;
        tickLayer.append(mark);
      }
    }
  }

  // --- reaction state (shake / flash / lag chase) ---------------------------------
  let shakeT = Infinity; // seconds since the last hit
  let shakeAmp = 0; // px amplitude at hit time
  let flashT = Infinity; // seconds since the flash started
  let flashDur = 0.08;
  let flashPeak = 0.45;

  // white lag bar: holds the pre-hit value for `wait`, then chases to the
  // current fill. `shown` is in active-layer % so layer swaps re-anchor cleanly.
  let lagShown = 100;
  let lagTarget = 100;
  let lagFrom = 100; // value when the chase started
  let lagTimer = 0; // counts down through hold, then through chase
  let lagChasing = false;

  function recomputeLag(prevLayer: number, prevPct: number, healed: boolean): void {
    const layer = activeLayer();
    const pct = layerPct();
    lagTarget = pct;
    if (!params.lag.on || reducedEffective()) {
      lagShown = pct;
      lagTimer = 0;
      lagChasing = false;
      return;
    }
    if (healed) {
      // healing erases the ghost — the bar simply grows
      lagShown = pct;
      lagTimer = 0;
      lagChasing = false;
      return;
    }
    if (layer < prevLayer) {
      // layer broke: the new layer starts full and the ghost drains it whole
      lagShown = 100;
    } else {
      // same layer: freeze whatever the ghost is currently showing
      lagShown = lagChasing ? lagShown : prevPct;
    }
    lagTimer = params.lag.wait;
    lagChasing = false;
  }

  // --- hit / heal / reset ----------------------------------------------------------
  function applyHp(next: number, healed: boolean): void {
    const prevLayer = activeLayer();
    const prevPct = layerPct();
    const prevHp = hp;
    hp = Math.max(0, Math.min(total(), next));
    const layer = activeLayer();
    const brokeLayer = !healed && layer < prevLayer;

    if (params.react.on && !healed && hp > 0) {
      const units = prevHp - hp; // absorbed damage only — overkill doesn't amplify
      shakeT = 0;
      shakeAmp = Math.min(params.react.shakeMax, 2.5 + units * 0.55) * (brokeLayer ? 1.35 : 1);
      flashDur = params.react.flash;
      flashPeak = brokeLayer ? 0.6 : 0.45;
      flashT = 0;
    }
    recomputeLag(prevLayer, prevPct, healed);
    paint(true);
  }

  function damage(units: number): void {
    applyHp(hp - units, false);
  }
  function heal(units: number): void {
    applyHp(hp + units, true);
  }
  function reset(): void {
    hp = total();
    lagShown = layerPct();
    lagTarget = lagShown;
    lagTimer = 0;
    lagChasing = false;
    shakeT = Infinity;
    flashT = Infinity;
    paint(true);
  }

  // --- paint ---------------------------------------------------------------------
  function paint(announce: boolean): void {
    const pct = layerPct();
    const layer = activeLayer();
    fill.style.width = `${pct}%`;
    fill.style.background = layerColor();
    lagFill.style.width = `${Math.max(lagShown, pct)}%`;
    const remaining = layer;
    badge.textContent = layerTotal > 1 ? `×${remaining}` : "";
    badge.classList.toggle("is-zero", remaining === 0);
    const dead = hp <= 0;
    stage.classList.toggle("is-dead", dead);
    stage.classList.toggle("is-layered", params.layers.on);
    // low-HP alarm: fraction of the *whole* boss, not of the active layer
    const low = params.alarm.on && !dead && hp / total() < params.alarm.threshold / 100;
    stage.classList.toggle("is-alarm", low);
    stage.style.setProperty("--boss-pulse", `${1 / Math.max(0.1, params.alarm.pulseHz)}s`);
    edge.classList.toggle("is-on", low && params.alarm.edge);
    const frac = Math.round((hp / total()) * 100);
    barTrack.setAttribute("aria-valuenow", String(frac));
    if (announce) barTrack.setAttribute("aria-valuetext", `${frac}%`);
  }

  // --- reduced motion --------------------------------------------------------------
  const reducedEffective = () =>
    params.reducedMotion === "on" || (params.reducedMotion === "auto" && rmQuery.matches);
  function syncReduced(): void {
    stage.classList.toggle("is-reduced", reducedEffective());
  }
  const onRmChange = () => {
    syncReduced();
    if (reducedEffective()) {
      // drop in-flight motion immediately
      shakeT = Infinity;
      if (lagChasing || lagTimer > 0) {
        lagShown = lagTarget;
        lagTimer = 0;
        lagChasing = false;
        paint(false);
      }
    }
  };
  rmQuery.addEventListener("change", onRmChange);

  // --- main loop --------------------------------------------------------------------
  let last = performance.now();
  let raf = 0;
  let disposed = false;

  function tick(now: number): void {
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    // white lag: hold, then chase with an ease-out — retarget-safe
    if (params.lag.on && !reducedEffective()) {
      if (!lagChasing && lagTimer > 0) {
        lagTimer -= dt;
        if (lagTimer <= 0) {
          lagFrom = lagShown;
          lagTimer = params.lag.catch;
          lagChasing = true;
        }
      } else if (lagChasing) {
        lagTimer -= dt;
        const t = Math.min(1, Math.max(0, 1 - lagTimer / Math.max(0.01, params.lag.catch)));
        lagShown = lagFrom + (lagTarget - lagFrom) * (1 - Math.pow(1 - t, 2.4));
        if (lagTimer <= 0) {
          lagShown = lagTarget;
          lagChasing = false;
          lagTimer = 0;
        }
        lagFill.style.width = `${Math.max(lagShown, layerPct())}%`;
      }
    }

    // shake: layered sines, amplitude eased to zero by shakeDecay
    if (shakeT < params.react.shakeDecay * 2 + 0.05 && !reducedEffective() && params.react.on) {
      shakeT += dt;
      const k = Math.max(0, 1 - shakeT / Math.max(0.01, params.react.shakeDecay));
      const a = shakeAmp * k * k;
      if (a < 0.05) {
        barZone.style.transform = "";
      } else {
        const t = now / 1000;
        barZone.style.transform = `translate(${a * Math.sin(t * 34.7)}px, ${a * 0.45 * Math.sin(t * 41.3)}px)`;
      }
    } else if (barZone.style.transform) {
      barZone.style.transform = "";
    }

    // flash overlay fade
    if (flashT < flashDur + 0.02) {
      flashT += dt;
      flashOverlay.style.opacity = String(Math.max(0, flashPeak * (1 - flashT / Math.max(0.01, flashDur))));
    } else if (flashOverlay.style.opacity && flashOverlay.style.opacity !== "0") {
      flashOverlay.style.opacity = "0";
    }

    raf = requestAnimationFrame(tick);
  }

  // --- live edits --------------------------------------------------------------------
  function setParams(p: BossHpParams): void {
    const prevTotal = total();
    const frac = hp / prevTotal;
    params = p;
    layerTotal = layerCount(); // re-derive before measuring the new total
    const nextTotal = total();
    if (nextTotal !== prevTotal) {
      // keep the boss at the same overall health when the layer count changes
      hp = Math.max(0, Math.min(nextTotal, Math.round(frac * nextTotal)));
    }
    // re-anchor the ghost to the (possibly remapped) fill
    lagTarget = layerPct();
    if (!params.lag.on || reducedEffective() || lagShown < lagTarget) lagShown = lagTarget;
    renderTicks();
    syncReduced();
    paint(false);
  }

  // clicking the stage is a light hit — buttons below do the rest
  const onStageClick = () => damage(12);
  stage.addEventListener("pointerdown", onStageClick);

  renderTicks();
  syncReduced();
  reset();
  raf = requestAnimationFrame(tick);

  return {
    setParams,
    damage,
    heal,
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      rmQuery.removeEventListener("change", onRmChange);
      stage.remove();
    },
  };
}
