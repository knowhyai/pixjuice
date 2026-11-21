import { categories } from "pixelfx/fx/categories";

const categoryIds = new Set(categories.map(({ id }) => id));

export function effectCategory(hash: string): string {
  const id = hash.slice(1);
  return hash.startsWith("#") && categoryIds.has(id) ? id : "all";
}

/** Old home bookmarks replace their history entry and keep the selected category. */
export function legacyEffectsTarget(pathname: string, search: string, hash: string): string | null {
  const root = /^\/(?:(zh|ja|ko|es)\/?)?$/.exec(pathname);
  if (!root) return null;
  const category = effectCategory(hash);
  if (hash !== "#effects" && category === "all") return null;
  const prefix = root[1] ? `/${root[1]}` : "";
  return `${prefix}/effects/${search}${category === "all" ? "" : hash}`;
}

export function redirectLegacyEffects(location: Pick<Location, "pathname" | "search" | "hash" | "replace">): boolean {
  const target = legacyEffectsTarget(location.pathname, location.search, location.hash);
  if (!target) return false;
  location.replace(target);
  return true;
}
