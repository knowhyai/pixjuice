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
}

interface PixGacha {
  RARITIES: string[];
  DEFAULT_CONFIG: PixGachaConfig;
  HISTORY_LIMIT: number;
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
  PixSkins: PixSkins;
  PixGacha: PixGacha;
  PixSave: PixSave;
  PixTranslate?: (key: string, vars?: Record<string, string | number>) => string;
  PixI18nRefresh?: () => void;
}
