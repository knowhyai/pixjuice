// The PixJuice catalog: every pixelfx effect, normalized, in gallery order.
// (The pure helpers/types live in fxinfo.ts, which the editor imports without this module.)

import { effects as mods, categories as cats } from "pixelfx/fx/index";
import { normalizeEntry, type CatalogEntry, type Category } from "./fxinfo";

export * from "./fxinfo";

export const CATEGORIES: Category[] = cats;

export const CATALOG: CatalogEntry[] = Object.entries(mods).map(([id, mod]) => normalizeEntry(id, mod));

export function findFx(id: string | null | undefined): CatalogEntry | undefined {
  if (!id) return undefined;
  return CATALOG.find((f) => f.id === id);
}
