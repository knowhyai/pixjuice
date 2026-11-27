// Globals defined by the UMD template cores (classic scripts, zero deps):
//   src/templates/skins.js                  → PixSkins
//   src/templates/gacha/gacha-core.js       → PixGacha
//   src/templates/save-load/save-core.js    → PixSave
// The site imports those files for their side effects; the ZIPs ship them as-is.

interface PixSkins {
  SKINS: string[];
  SKIN_KEYS: Record<string, string>;
  chestSpriteBase(skin: string, assetsBase?: string): string;
  ASSET_PAGE: string;
  isSkin(s: string): boolean;
}

interface PixGachaItem {
  id: string;
  name: string;
  rarity: string;
  weight?: number;
}

interface PixGachaConfig {
  currency: { name: string; single: number; multi: number };
  rates: Record<string, number>;
  pity: { ssr: number; sr: number };
  items: PixGachaItem[];
  wheel: { diameter: number; aspect: number; hubX: number; hubY: number; layers: { entries: { label: string; weight: number; multiplier?: number }[] }[] };
}

interface PixGacha {
  RARITIES: string[];
  DEFAULT_CONFIG: PixGachaConfig;
  HISTORY_LIMIT: number;
  MULTI_PULLS: number;
  validateConfig(raw: unknown): { ok: true; config: PixGachaConfig } | { ok: false; error: string };
  pickWeighted<T>(entries: T[], weightOf: (e: T) => number, rng?: () => number): T;
  makeState(sinceSsr?: number, sinceSr?: number): { sinceSsr: number; sinceSr: number };
  rollOnce(
    config: PixGachaConfig,
    state: { sinceSsr: number; sinceSr: number },
    rng?: () => number,
    opts?: { forceSrPlus?: boolean },
  ): { item: PixGachaItem; state: { sinceSsr: number; sinceSr: number } };
  pull(
    config: PixGachaConfig,
    state: { sinceSsr: number; sinceSr: number },
    times: number,
    rng?: () => number,
  ): { results: PixGachaItem[]; state: { sinceSsr: number; sinceSr: number } };
  itemOdds(config: PixGachaConfig, item: PixGachaItem): number;
  wheelSegments(config: PixGachaConfig): { item: PixGachaItem; odds: number }[];
  wheelPick(config: PixGachaConfig, rng?: () => number): number;
  record(
    history: { at: number; item: PixGachaItem }[],
    items: PixGachaItem[],
    at: number,
    limit: number,
  ): { at: number; item: PixGachaItem }[];
}

interface PixSaveEntry {
  v: number;
  slot: string | null;
  name: string;
  chapter: number;
  level: number;
  gold: number;
  x: number;
  y: number;
  playtime: number;
  ts: number;
  thumb: string | null;
  auto: boolean;
}

interface PixSaveAdapter {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

interface PixSave {
  VERSION: number;
  AUTO_ID: string;
  memoryAdapter(): PixSaveAdapter;
  newGame(slotId?: string): PixSaveEntry;
  write(adapter: PixSaveAdapter, ns: string, entry: Partial<PixSaveEntry>): PixSaveEntry;
  read(adapter: PixSaveAdapter, ns: string, slotId: string): PixSaveEntry | null;
  list(adapter: PixSaveAdapter, ns: string, slotIds: string[]): Record<string, PixSaveEntry | null>;
  remove(adapter: PixSaveAdapter, ns: string, slotId: string): void;
  sanitize(e: unknown): PixSaveEntry | null;
  exportText(entry: Partial<PixSaveEntry>): string;
  parseImport(text: string): { ok: true; entry: PixSaveEntry } | { ok: false; error: string };
  formatPlaytime(sec: number): string;
}

interface Window {
  PixStrings: Record<string, Record<string,string>>;
  PixSkins: PixSkins;
  PixGachaConfigJSON?: () => string;
  PixGacha: PixGacha;
  PixSave: PixSave;
  PixTranslate?: (key: string, vars?: Record<string, string | number>) => string;
  PixI18nRefresh?: () => void;
}

interface PixSettleConfig {
  outcome: "victory" | "defeat" | "clear";
  title: string;
  subtitle: string;
  grade: "" | "S" | "A" | "B" | "C" | "D";
  stars: number;
  starMax: number;
  score: number;
  stats: { id: string; label: string; value: string | number }[];
  rewards: { id: string; name: string; count: number; rarity?: string }[];
}

interface PixSettle {
  OUTCOMES: readonly PixSettleConfig["outcome"][];
  GRADES: readonly Exclude<PixSettleConfig["grade"], "">[];
  ROW_LIMIT: number;
  NUMBER_LIMIT: number;
  DEFAULT_CONFIG: Readonly<Omit<PixSettleConfig, "stats" | "rewards">> & {
    stats: readonly Readonly<PixSettleConfig["stats"][number]>[];
    rewards: readonly Readonly<PixSettleConfig["rewards"][number]>[];
  };
  validateConfig(raw?: unknown): { ok: true; config: PixSettleConfig } | { ok: false; error: string };
  gradeFromScore(score: number): Exclude<PixSettleConfig["grade"], "">;
  formatDuration(seconds: number): string;
}

interface Window {
  PixSettle: PixSettle;
}
