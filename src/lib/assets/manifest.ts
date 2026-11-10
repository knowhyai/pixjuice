// Free-asset manifest: fetch + defensive validation for /free-assets/.
// The build script (scripts/build-assets-manifest.mjs) owns the file format;
// this side guards against a stale or truncated manifest so the library page
// degrades to "coming soon" cards instead of throwing. The pure part runs in
// node --test.

export const ASSET_CATEGORIES = ["props", "characters", "vehicles", "environment"] as const;
export type AssetCategory = typeof ASSET_CATEGORIES[number];
export function categoryOf(value: unknown): AssetCategory {
  if (value === "structure") return "environment";
  if (value === "lighting") return "props";
  return ASSET_CATEGORIES.includes(value as AssetCategory) ? value as AssetCategory : "props";
}
export function availableCategories(assets: FaAsset[]): AssetCategory[] {
  const present = new Set(visibleProducts(assets).flat().map(a => a.category));
  return ASSET_CATEGORIES.filter(c => present.has(c));
}

export interface FaAsset {
  id: string;
  product_id?: string;
  parts_meta?: string;
  hidden?: boolean;
  product_hidden?: boolean;
  state?: string;
  name: { en: string; zh: string | null };
  category: AssetCategory;
  style_tier: string;
  palette: string;
  tags: string[];
  placeholder: boolean;
  procedural?: string;
  glb: { lod0: string | null; lod1: string | null } | null;
  sprites: Record<string, string> | null;
  thumb: string | null;
  license: { id: string; file: string | null; commercial_use: boolean };
}

export type FaKind = "2d" | "3d" | "2d3d";

/** "2d3d" when an entry ships both a model and sprites (shown in both filters). */
export function kindOf(a: FaAsset): FaKind {
  if (a.glb && a.sprites) return "2d3d";
  if (a.glb) return "3d";
  return "2d";
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function parseAsset(raw: unknown): FaAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (!id || !/^[a-z0-9-]+$/.test(id)) return null;
  const name = (r.name && typeof r.name === "object" ? r.name : {}) as Record<string, unknown>;
  const en = str(name.en);
  if (!en) return null;
  const glbRaw = r.glb as Record<string, unknown> | null;
  const glb =
    glbRaw && (str(glbRaw.lod0) || str(glbRaw.lod1))
      ? { lod0: str(glbRaw.lod0), lod1: str(glbRaw.lod1) }
      : null;
  const spritesRaw = r.sprites as Record<string, unknown> | null;
  const sprites =
    spritesRaw && typeof spritesRaw === "object"
      ? (Object.fromEntries(
          Object.entries(spritesRaw).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>)
      : null;
  const licenseRaw = (r.license ?? {}) as Record<string, unknown>;
  return {
    id,
    parts_meta: str(r.parts_meta) ?? undefined,
    product_id: str(r.product_id) ?? undefined,
    hidden: r.hidden === true,
    product_hidden: r.product_hidden === true,
    state: str(r.state) ?? id.split("-").pop(),
    name: { en, zh: str(name.zh) },
    category: categoryOf(r.category),
    style_tier: str(r.style_tier) ?? "procedural",
    palette: str(r.palette) ?? "default",
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string").slice(0, 12) : [],
    placeholder: r.placeholder === true || (!glb && !sprites),
    procedural: str(r.procedural) ?? undefined,
    glb,
    sprites,
    thumb: str(r.thumb),
    license: {
      id: str(licenseRaw.id) ?? "unknown",
      file: str(licenseRaw.file),
      commercial_use: licenseRaw.commercial_use !== false,
    },
  };
}

/** Validate a parsed manifest; returns the good entries (bad ones are dropped). */
export function sanitizeManifest(raw: unknown): FaAsset[] {
  if (!raw || typeof raw !== "object") return [];
  const assets = (raw as Record<string, unknown>).assets;
  if (!Array.isArray(assets)) return [];
  return assets.map(parseAsset).filter((a): a is FaAsset => a !== null);
}

export async function loadManifest(url = "/free-assets/manifest.json"): Promise<FaAsset[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  return sanitizeManifest(await res.json());
}

/** A hidden product suppresses every variant in the grid; detail URLs stay available. */
export function productId(a: FaAsset): string { return a.product_id || a.id; }
export function visibleProducts(assets: FaAsset[], matches: (a: FaAsset) => boolean = () => true): FaAsset[][] {
  const hidden = new Set(assets.filter(a => a.product_hidden).map(productId));
  const groups = new Map<string, FaAsset[]>();
  for (const a of assets) {
    if (a.style_tier !== "realistic" || a.hidden || a.placeholder || hidden.has(productId(a)) || !matches(a)) continue;
    const id = productId(a);
    groups.set(id, [...(groups.get(id) || []), a]);
  }
  return [...groups.values()];
}
