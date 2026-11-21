// Engine code generators for the boss HP bar page. Plain string building from
// the live BossHpParams so the exported snippets always match the sliders.
// Godot targets 4.x GDScript; the web export is one self-contained HTML file.
// Comments are written for this page — they are not copied from any notebook.

import { BOSS_LAYER_COLORS, type BossHpParams } from "./boss-params";

const n = (v: number, digits = 2): string => {
  const s = v.toFixed(digits);
  return s.replace(/\.?0+$/, "") || "0";
};
const gdBool = (b: boolean) => (b ? "true" : "false");

const hex = (c: string) => `Color("${c}")`;

export function godotBossHp(p: BossHpParams): string {
  // outermost layer first (index 0 = full HP), matching the demo's mapping
  const colors = p.layers.on
    ? Array.from({ length: Math.max(1, Math.round(p.layers.count)) }, (_, i) =>
        hex(BOSS_LAYER_COLORS[Math.min(BOSS_LAYER_COLORS.length - 1, i)]),
      )
    : [hex(BOSS_LAYER_COLORS[BOSS_LAYER_COLORS.length - 1])];

  const lagBlock = p.lag.on
    ? `	# Layer 1 — delayed white bar. Runs AFTER _layout() so the chase
	# targets the post-hit fill. The ghost holds the pre-hit width (or
	# refills to the top of a freshly broken layer), waits lag_wait, then
	# eases onto the fill over lag_catch. A new hit kills the pending tween
	# and restarts the hold, so rapid damage keeps the ghost readable.
	if delayed_bar_on and hp > 0.0 and not reduce_motion:
		_ghost_chase(broke)`
    : `	# Layer 1 — delayed white bar is switched off in the current preset.`;

  const reactBlock = p.react.on
    ? `	# Layer 2 — hit shake + flash. Shake amplitude is set here and decays in
	# _process; the flash is a one-shot alpha tween on the overlay.
	if hit_react_on:
		_shake_impulse(units)
		_flash()`
    : `	# Layer 2 — hit reaction is switched off in the current preset.`;

  const alarmEdge = p.alarm.edge
    ? `		# Screen-edge vignette lives in your HUD layer — never on the window root,
		# or it would tint every menu along with the fight. Null-tolerant lookup,
		# so the recipe still runs before you add the node.
		if alarm_screen_edge and screen_edge_vignette:
			var edge_pulse := 0.5 + 0.5 * sin(_alarm_clock * TAU * ${n(p.alarm.pulseHz, 1)})
			screen_edge_vignette.modulate.a = 0.18 + 0.22 * edge_pulse`
    : `		# The screen-edge vignette is disabled in the current preset.`;

  // the ghost helper is only emitted when the delayed-bar layer is on
  const ghostFn = p.lag.on
    ? `func _ghost_chase(broke := false) -> void:
	if _lag_tween:
		_lag_tween.kill()
	if broke:
		# the new layer starts full — the ghost drains it whole
		lag_fill.size.x = track.size.x
	_lag_tween = create_tween()
	_lag_tween.tween_interval(lag_wait)
	_lag_tween.tween_property(lag_fill, "size:x", fill.size.x, lag_catch) \\
		.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)

`
    : "";

  return `extends Control
# Boss HP bar recipe — exported from the PixJuice Game Feel Lab.
# Five independent layers: delayed white bar, hit shake + flash, scale ticks,
# layered HP colors, low-HP alarm. All timings are heuristics — retune them.
#
# Scene setup: this Control (the bar zone) with children:
#   Track (Control) -> LagFill (ColorRect), Fill (ColorRect), Ticks (Control)
#   Tag (Label "BOSS"), LayerBadge (Label), FlashRect (ColorRect, white)
# Animate the bar zone itself for the shake; anchor it inside your HUD.
# Keep LagFill/Fill anchors equal on both axes (offsets only) — stretched
# anchors let the layout system override the script's width writes.

@export var units_per_layer := 100.0
@export var max_layers := ${Math.max(1, Math.round(p.layers.count))}${p.layers.on ? "" : "   # layered HP off: the bar is a single layer"}
@export var layered_bar := ${gdBool(p.layers.on)}
@export var layer_colors: Array[Color] = [${colors.join(", ")}]   # outermost first

@export var delayed_bar_on := ${gdBool(p.lag.on)}
@export var lag_wait := ${n(p.lag.wait)}            # seconds the ghost holds (heuristic)
@export var lag_catch := ${n(p.lag.catch)}            # seconds the ghost needs to catch up

@export var hit_react_on := ${gdBool(p.react.on)}
@export var shake_decay := ${n(p.react.shakeDecay)}           # seconds until the shake settles (heuristic)
@export var shake_max_px := ${Math.round(p.react.shakeMax)}            # worst-case offset (heuristic)
@export var flash_seconds := ${n(p.react.flash)}

@export var ticks_on := ${gdBool(p.ticks.on)}
@export var tick_step_percent := ${Math.round(p.ticks.step)}
@export var tick_markers := ${gdBool(p.ticks.markers)}          # small flags at 25 / 50 / 75

@export var low_alarm_on := ${gdBool(p.alarm.on)}
@export var alarm_threshold := ${Math.round(p.alarm.threshold)}          # percent of TOTAL hp (heuristic)
@export var alarm_hz := ${n(p.alarm.pulseHz, 1)}             # glow pulse frequency (heuristic)
@export var alarm_screen_edge := ${gdBool(p.alarm.edge)}
@export var reduce_motion := false:   # wire to your accessibility settings; the web export reads prefers-reduced-motion
	set(value):
		reduce_motion = value
		if value and is_node_ready():
			# flipping it mid-chase drops the in-flight ghost immediately
			if _lag_tween:
				_lag_tween.kill()
			_layout()

@onready var track: Control = $Track
@onready var fill: ColorRect = $Track/Fill
@onready var lag_fill: ColorRect = $Track/LagFill
@onready var ticks: Control = $Track/Ticks
@onready var flash_rect: ColorRect = $FlashRect
@onready var layer_badge: Label = $LayerBadge
# optional: a red vignette ColorRect in your HUD (enable its unique name).
# Only needed when alarm_screen_edge is on.
@onready var screen_edge_vignette: ColorRect = get_node_or_null("%EdgeVignette")

var hp := 0.0
var _home := Vector2.ZERO
var _shake_t := 1.0e9
var _shake_amp := 0.0
var _alarm_clock := 0.0
var _lag_tween: Tween
var _flash_tween: Tween

func setup(start_fraction := 1.0) -> void:
	hp = max_layers * units_per_layer * clampf(start_fraction, 0.0, 1.0)
	if _lag_tween:
		_lag_tween.kill()
	_build_ticks()
	_layout()
	lag_fill.size.x = fill.size.x   # a fresh fight starts with no ghost

func take_damage(units: float) -> void:
	var before := hp
	hp = maxf(hp - units, 0.0)
	var broke := active_layer() < ceili(before / units_per_layer)
${reactBlock}
	if broke:
		# a broken layer reads harder: stronger flash, longer-feeling shake
		_shake_amp *= 1.35
	_layout()
${lagBlock}

func heal(units: float) -> void:
	hp = minf(hp + units, max_layers * units_per_layer)
	# healing erases the ghost — the bar just grows onto the new fill
	if _lag_tween:
		_lag_tween.kill()
	_layout()
	lag_fill.size.x = fill.size.x

func active_layer() -> int:
	if hp <= 0.0:
		return 0
	return mini(ceili(hp / units_per_layer), max_layers)

func _layout() -> void:
	var layer := active_layer()
	var frac := 0.0 if layer <= 0 else (hp - (layer - 1) * units_per_layer) / units_per_layer
	fill.color = layer_colors[maxi(0, mini(layer_colors.size() - 1, max_layers - layer))] if layered_bar else layer_colors[0]
	fill.size.x = track.size.x * frac
	lag_fill.size.x = maxf(lag_fill.size.x, fill.size.x) if delayed_bar_on and hp > 0.0 and not reduce_motion else fill.size.x
	layer_badge.text = ("×%d" % layer) if layered_bar and max_layers > 1 else ""
	flash_rect.visible = hp > 0.0

func _build_ticks() -> void:
	for c in ticks.get_children():
		c.queue_free()
	if not ticks_on:
		return
	for i in range(tick_step_percent, 100, tick_step_percent):
		ticks.add_child(_make_tick(i, 0.55))
	if tick_markers:
		for m in [25, 50, 75]:
			ticks.add_child(_make_tick(m, 1.0, true))

func _make_tick(percent: int, height: float, marker := false) -> ColorRect:
	var t := ColorRect.new()
	t.color = Color(1, 1, 1, 0.35 if not marker else 0.9)
	t.anchor_left = percent / 100.0
	t.anchor_right = percent / 100.0
	t.offset_left = -1
	t.offset_right = 1
	t.anchor_top = 0.0 if marker else 0.22
	t.anchor_bottom = 1.0 if marker else 0.78
	return t

${ghostFn}func _shake_impulse(units: float) -> void:
	_shake_t = 0.0
	_shake_amp = minf(shake_max_px, 2.5 + units * 0.55)

func _flash() -> void:
	if _flash_tween:
		_flash_tween.kill()
	flash_rect.modulate.a = 0.45
	_flash_tween = create_tween()
	_flash_tween.tween_property(flash_rect, "modulate:a", 0.0, flash_seconds) \\
		.set_ease(Tween.EASE_OUT)

func _ready() -> void:
	_home = position
	track.resized.connect(_on_track_resized)
	setup()

func _on_track_resized() -> void:
	# live edits resize the track in absolute pixels — re-derive both bars so
	# no stale ghost width (or tween target) survives; the web export works
	# in percent and never has this problem
	if _lag_tween:
		_lag_tween.kill()
	_layout()
	lag_fill.size.x = fill.size.x

func _process(delta: float) -> void:
	# --- shake: layered sines, quadratic decay to zero by shake_decay ---
	if _shake_t < shake_decay * 2.0 and not reduce_motion:
		_shake_t += delta
		var k := maxf(0.0, 1.0 - _shake_t / maxf(shake_decay, 0.01))
		var a := _shake_amp * k * k
		position = _home + Vector2(a * sin(_shake_t * 34.7), a * 0.45 * sin(_shake_t * 41.3)) if a > 0.05 else _home
	else:
		position = _home

	# --- low-HP alarm: fraction of the WHOLE boss, not of the active layer ---
	var low := low_alarm_on and hp > 0.0 and hp / (max_layers * units_per_layer) < alarm_threshold / 100.0
	if low:
		_alarm_clock += delta
		var pulse := 0.5 + 0.5 * sin(_alarm_clock * TAU * alarm_hz)
		if reduce_motion:
			pulse = 0.6
		modulate = Color(1.0, 1.0 - 0.08 * pulse, 1.0 - 0.08 * pulse)
${alarmEdge}
	else:
		_alarm_clock = 0.0
		modulate = Color.WHITE
		if screen_edge_vignette:
			screen_edge_vignette.modulate.a = 0.0
`;
}

export function webBossHp(p: BossHpParams): string {
  // outermost layer first (index 0 = full HP), matching the demo's mapping
  const colors = p.layers.on
    ? Array.from({ length: Math.max(1, Math.round(p.layers.count)) }, (_, i) =>
        BOSS_LAYER_COLORS[Math.min(BOSS_LAYER_COLORS.length - 1, i)],
      )
    : [BOSS_LAYER_COLORS[BOSS_LAYER_COLORS.length - 1]];
  const ticks = p.ticks.on
    ? Array.from({ length: Math.floor((100 - 1) / Math.round(p.ticks.step)) }, (_, i) => (i + 1) * Math.round(p.ticks.step))
        .filter((v) => v < 100)
        .map((v) => `  <i class="tick" style="left:${v}%"></i>`)
        .join("\n")
    : "";
  const markers = p.ticks.markers && p.ticks.on ? [25, 50, 75].map((v) => `  <i class="mark" style="left:${v}%"></i>`).join("\n") : "";

  return `<!doctype html>
<!-- Boss HP bar recipe — exported from the PixJuice Game Feel Lab.
     One self-contained file: CSS custom properties carry the live recipe
     values; the script runs the same state machine as the demo page.
     All timings are heuristics — retune them. CC0. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boss HP bar recipe</title>
<style>
  :root {
    --layer-colors: ${colors.join(", ")};
    --alarm-hz: ${n(p.alarm.pulseHz, 1)};              /* heuristic */
    --alarm-glow: #ff2d3f;
  }
  .boss-hp { --pulse: calc(1s / var(--alarm-hz)); width: min(640px, 92vw); font: 14px system-ui, sans-serif; }
  .boss-hp * { box-sizing: border-box; }
  .boss-name { display: flex; align-items: baseline; gap: 10px; color: #eee; letter-spacing: .12em; }
  .boss-name b { font-size: 13px; }
  .boss-name .badge { margin-left: auto; font-weight: 700; color: #fff; opacity: .9; }
  .boss-track { position: relative; height: 22px; margin-top: 6px; border: 2px solid #46405c; border-radius: 4px; background: #14111d; overflow: hidden; }
  .boss-lag, .boss-fill { position: absolute; inset: 0 auto 0 0; width: 100%; }
  .boss-lag { background: #f3f0ff; transition: none; }
  .boss-fill { background: var(--layer-colors); transition: width .12s linear; }
  .boss-flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
  .tick { position: absolute; top: 22%; bottom: 22%; width: 1px; background: rgba(255,255,255,.35); }
  .mark { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,.85); }
  .boss-hp.is-alarm .boss-track { box-shadow: 0 0 calc(14px * var(--alarm-hz) / 2.5) var(--alarm-glow); animation: boss-pulse var(--pulse) infinite; }
  .boss-hp.is-alarm .boss-fill { animation: boss-pulse var(--pulse) infinite; }
  @keyframes boss-pulse { 50% { filter: brightness(1.45); } }
  .boss-edge { position: absolute; inset: 0; pointer-events: none; opacity: 0;
    box-shadow: inset 0 0 60px 12px rgba(255, 45, 63, .4); animation: boss-pulse var(--pulse) infinite; }
  .boss-hp .boss-edge { display: none; }
  .boss-hp.is-alarm.is-edge .boss-edge { display: block; }
  .boss-hp.is-reduced .boss-fill, .boss-hp.is-reduced .boss-track { animation: none; filter: brightness(1.2); }
  .boss-hp.is-reduced .boss-edge { animation: none; opacity: .55; }
  .boss-hp.is-dead { opacity: .55; filter: saturate(.2); }
  @media (prefers-reduced-motion: reduce) { .boss-fill, .boss-track, .boss-edge { animation: none !important; } }
</style>
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a10">
<div style="position:relative; padding: 40px 0; width: min(640px, 92vw);">
  <div class="boss-hp" id="boss">
    <div class="boss-name"><b>BOSS</b><span class="badge" id="badge">×${Math.max(1, Math.round(p.layers.count))}</span></div>
    <div class="boss-track" role="progressbar" aria-label="boss health" aria-valuemin="0" aria-valuemax="100">
      <div class="boss-lag" id="lag"></div>
      <div class="boss-fill" id="fill"></div>
${ticks}
${markers}
      <div class="boss-flash" id="flash"></div>
    </div>
    <div class="boss-edge"></div>
  </div>
  <p style="color:#777;font-size:12px">
    <button data-dmg="12">hit</button> <button data-dmg="30">heavy</button>
    <button data-heal="18">heal</button> <button id="reset">reset</button>
  </p>
</div>
<script>
// Recipe values baked in from the lab (all heuristics):
const CFG = {
  unitsPerLayer: 100,
  layers: ${p.layers.on ? Math.max(1, Math.round(p.layers.count)) : 1},
  lag: ${p.lag.on ? `{ wait: ${n(p.lag.wait)}, catch: ${n(p.lag.catch)} }` : "null"},
  react: ${p.react.on ? `{ decay: ${n(p.react.shakeDecay)}, maxPx: ${Math.round(p.react.shakeMax)}, flash: ${n(p.react.flash)} }` : "null"},
  alarm: ${p.alarm.on ? `{ threshold: ${Math.round(p.alarm.threshold)}, hz: ${n(p.alarm.pulseHz, 1)}, edge: ${p.alarm.edge ? "true" : "false"} }` : "null"},
  colors: [${colors.map((c) => `"${c}"`).join(", ")}],
};

class BossBar {
  constructor(root) {
    this.root = root;
    this.fill = root.querySelector("#fill");
    this.lag = root.querySelector("#lag");
    this.badge = root.querySelector("#badge");
    this.flash = root.querySelector("#flash");
    this.hp = CFG.layers * CFG.unitsPerLayer;
    this.shown = 100; this.target = 100; this.chase = 0; this.timer = 0;
    this.shakeT = 1e9; this.amp = 0; this.flashT = 1e9;
    this.rm = matchMedia("(prefers-reduced-motion: reduce)");
    this.rm.addEventListener("change", () => this.paint());
    this.reset();
    requestAnimationFrame((t) => this.frame(t));
  }
  layer() { return this.hp <= 0 ? 0 : Math.min(CFG.layers, Math.ceil(this.hp / CFG.unitsPerLayer)); }
  pct() { const l = this.layer(); return l <= 0 ? 0 : (this.hp - (l - 1) * CFG.unitsPerLayer) / CFG.unitsPerLayer * 100; }
  total() { return CFG.layers * CFG.unitsPerLayer; }
  apply(next, healed) {
    const before = this.layer(), prevPct = this.pct(), prevHp = this.hp;
    this.hp = Math.max(0, Math.min(this.total(), next));
    const broke = !healed && this.layer() < before;
    if (CFG.react && !healed && this.hp > 0) {
      this.amp = Math.min(CFG.react.maxPx, 2.5 + (prevHp - this.hp) * 0.55) * (broke ? 1.35 : 1);
      this.shakeT = 0; this.flashT = 0;
    }
    this.target = this.pct();
    if (CFG.lag && !this.reduced() && !healed) {
      this.shown = broke ? 100 : (this.chase > 0 ? this.shown : prevPct);
      this.timer = CFG.lag.wait; this.chase = 0;
    } else { this.shown = this.pct(); this.timer = 0; this.chase = 0; }
    this.paint();
  }
  damage(u) { this.apply(this.hp - u, false); }
  heal(u) { this.apply(this.hp + u, true); }
  reset() { this.hp = this.total(); this.shown = this.target = this.pct(); this.timer = this.chase = 0; this.paint(); }
  reduced() { return this.rm.matches; }
  paint() {
    const layer = this.layer(), pct = this.pct();
    this.fill.style.width = pct + "%";
    this.fill.style.background = CFG.colors[Math.max(0, Math.min(CFG.colors.length - 1, CFG.layers - layer))] || CFG.colors[0];
    this.lag.style.width = Math.max(this.shown, pct) + "%";
    this.badge.textContent = CFG.layers > 1 ? "×" + layer : "";
    this.root.classList.toggle("is-dead", this.hp <= 0);
    const low = !!CFG.alarm && this.hp > 0 && this.hp / this.total() < CFG.alarm.threshold / 100;
    this.root.classList.toggle("is-alarm", low);
    this.root.classList.toggle("is-edge", low && CFG.alarm.edge);
    this.root.classList.toggle("is-reduced", this.reduced());
    this.root.parentElement.style.setProperty("--alarm-hz", CFG.alarm ? CFG.alarm.hz : 2.5);
    this.root.querySelector(".boss-track").setAttribute("aria-valuenow", Math.round(this.hp / this.total() * 100));
  }
  frame(now) {
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000); this.last = now;
    if (CFG.lag && !this.reduced()) {
      if (this.chase === 0 && this.timer > 0) { this.timer -= dt; if (this.timer <= 0) { this.from = this.shown; this.chase = CFG.lag.catch; } }
      else if (this.chase > 0) {
        this.chase -= dt;
        const t = Math.min(1, Math.max(0, 1 - this.chase / CFG.lag.catch));
        this.shown = this.from + (this.target - this.from) * (1 - Math.pow(1 - t, 2.4));
        if (this.chase <= 0) { this.shown = this.target; }
        this.lag.style.width = Math.max(this.shown, this.pct()) + "%";
      }
    }
    if (CFG.react && !this.reduced() && this.shakeT < CFG.react.decay * 2) {
      this.shakeT += dt;
      const k = Math.max(0, 1 - this.shakeT / CFG.react.decay), a = this.amp * k * k, t = now / 1000;
      this.root.style.transform = a > 0.05
        ? "translate(" + a * Math.sin(t * 34.7) + "px," + a * 0.45 * Math.sin(t * 41.3) + "px)" : "";
    } else this.root.style.transform = "";
    if (this.flashT < (CFG.react ? CFG.react.flash : 0.08) + 0.02) {
      this.flashT += dt;
      this.flash.style.opacity = Math.max(0, 0.45 * (1 - this.flashT / CFG.react.flash));
    } else this.flash.style.opacity = "0";
    requestAnimationFrame((n2) => this.frame(n2));
  }
}

const bar = new BossBar(document.getElementById("boss"));
document.querySelectorAll("[data-dmg]").forEach((b) => b.addEventListener("click", () => bar.damage(+b.dataset.dmg)));
document.querySelectorAll("[data-heal]").forEach((b) => b.addEventListener("click", () => bar.heal(+b.dataset.heal)));
document.getElementById("reset").addEventListener("click", () => bar.reset());
</script>
</body>
</html>
`;
}

export interface BossCodeTab {
  id: string;
  engine: "godot" | "web";
  label: string;
  code: string;
}

export function buildBossCodeTabs(p: BossHpParams): BossCodeTab[] {
  return [
    { id: "gd-boss", engine: "godot", label: "boss_hp_bar.gd", code: godotBossHp(p) },
    { id: "web-boss", engine: "web", label: "boss-bar.html", code: webBossHp(p) },
  ];
}
