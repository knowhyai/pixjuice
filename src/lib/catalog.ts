// The PixJuice catalog: every pixelfx effect, normalized, in gallery order.

import { effects as mods, categories as cats } from "pixelfx/fx/index";
import type { FxMeta, FxModule } from "pixelfx";

export interface Category {
  id: string;
  name: string;
  blurb: string;
}

export interface CatalogEntry {
  /** Effect id, e.g. "ice/frost-nova". */
  id: string;
  /** Category id, e.g. "ice". */
  cat: string;
  name: string;
  mod: FxModule;
  meta: FxMeta;
}

const DEFAULT_META = { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {} };

export const CATEGORIES: Category[] = cats;

export const CATALOG: CatalogEntry[] = Object.entries(mods).map(([id, mod]) => {
  const meta = { ...DEFAULT_META, ...mod.meta } as FxMeta;
  return { id, cat: id.split("/")[0], name: meta.name, mod, meta };
});

export function findFx(id: string | null | undefined): CatalogEntry | undefined {
  if (!id) return undefined;
  return CATALOG.find((f) => f.id === id);
}

/** Full-screen effects (transitions, weather, impact frames) fill a 16:9 stage edge to edge. */
export function isScreen(meta: FxMeta): boolean {
  return meta.size[0] >= 320 && Math.abs(meta.size[0] / meta.size[1] - 16 / 9) < 0.05;
}

/** Frames in a full play of the effect (upstream convention: one-shots include the final frame). */
export function frameCount(meta: FxMeta): number {
  return Math.max(1, Math.round(meta.duration * meta.fps!) + (meta.loop ? 0 : 1));
}

/** The default palette an effect ships with, or null if it has none. */
export function defaultPalette(entry: CatalogEntry): string[] | null {
  const pal = entry.meta.options?.palette;
  return Array.isArray(pal) && pal.length ? (pal as string[]) : null;
}

/** What the body does around the effect, in a line — for effects with an act.
 *  Takes a translator so the phrase pieces localize (ed.* keys). */
export function actFacts(
  mod: FxModule,
  meta: FxMeta,
  tr: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const k = mod.act?.poses ?? [];
  if (!k.length) return "";
  const lead = Math.max(0, -k[0][0]);
  const end = k[k.length - 1][0] - meta.duration;
  const hits = (mod.act?.hits ?? []).filter((h) => (h as { stop?: number }).stop);
  const parts: string[] = [];
  if (lead > 0) parts.push(tr("ed.windup", { n: lead.toFixed(2) }));
  if (hits.length)
    parts.push(
      hits.length === 1
        ? tr("ed.freezeMs", { n: Math.round((hits[0] as { stop: number }).stop * 1000) })
        : tr("ed.freezes", { n: hits.length }),
    );
  if (!meta.loop && end > 0.02) parts.push(tr("ed.recovery", { n: end.toFixed(2) }));
  return parts.join(", ") || tr("ed.actMoves");
}

/** A file-friendly base name for exports: "ice/frost-nova" -> "pixjuice-ice-frost-nova". */
export function exportBase(entry: CatalogEntry): string {
  return `pixjuice-${entry.id.split("/").join("-")}`;
}
