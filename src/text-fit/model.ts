export const MODES = ["visible", "hidden", "overflow-wrap", "break-all", "ellipsis"] as const;
export type Mode = (typeof MODES)[number];

const NORMAL = {
  "box-sizing": "content-box",
  overflow: "visible",
  "white-space": "pre-wrap",
  "overflow-wrap": "normal",
  "word-break": "normal",
  "text-overflow": "clip",
};

export const MODE_CSS = {
  visible: NORMAL,
  hidden: { ...NORMAL, overflow: "hidden" },
  "overflow-wrap": { ...NORMAL, "overflow-wrap": "break-word" },
  "break-all": { ...NORMAL, "word-break": "break-all" },
  ellipsis: { ...NORMAL, overflow: "hidden", "white-space": "nowrap", "text-overflow": "ellipsis" },
} satisfies Record<Mode, typeof NORMAL>;

export const BOX_FIELDS = ["width", "height", "fontSize", "lineHeight"] as const;

export const CONTROLS = {
  width: { min: 56, max: 640, step: 1, initial: 256 },
  height: { min: 16, max: 320, step: 1, initial: 84 },
  fontSize: { min: 8, max: 80, step: 1, initial: 20 },
  lineHeight: { min: 0.75, max: 2.5, step: 0.05, initial: 1.35 },
};

type Box = Record<(typeof BOX_FIELDS)[number], number>;

export type Setup = Box & { text: string; sampleId: string | null; lang: string; mode: Mode };

export function properties(box: Box, mode: Mode) {
  return {
    width: `${box.width}px`,
    height: `${box.height}px`,
    "font-family": 'system-ui, "Segoe UI", sans-serif',
    "font-size": `${box.fontSize}px`,
    "line-height": String(box.lineHeight),
    ...MODE_CSS[mode],
  };
}

export function serializeCss(setup: Setup): string {
  const declarations = Object.entries(properties(setup, setup.mode))
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `/* Browser-local preview */\n.ui-text {\n${declarations}\n}`;
}

export function serializeJson(setup: Setup): string {
  return JSON.stringify({ ...setup, preview: "browser-local" }, null, 2);
}

interface Metrics {
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  wraps: boolean;
}

export function classifyFit(mode: Mode, metrics: Metrics) {
  const x = metrics.scrollWidth > metrics.clientWidth;
  const y = metrics.scrollHeight > metrics.clientHeight;
  const outcome = x || y ? (MODE_CSS[mode].overflow === "hidden" ? "clips" : "overflows") : "fits";
  return { outcome, wraps: metrics.wraps, x, y } as const;
}
