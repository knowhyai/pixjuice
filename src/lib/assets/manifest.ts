// Free-asset manifest: fetch + defensive validation for /free-assets/.
// The build script (scripts/build-assets-manifest.mjs) owns the file format;
// this side guards against a stale or truncated manifest so the library page
// degrades to "coming soon" cards instead of throwing. The pure part runs in
// node --test.

export interface FaAsset {
  id: string;
  name: { en: string; zh: string | null };
  category: string;
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
    name: { en, zh: str(name.zh) },
    category: str(r.category) ?? "props",
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
