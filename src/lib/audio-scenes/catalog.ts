import type catalog from "../../../public/audio-scenes/catalog.json";

export type Catalog = typeof catalog;
export type Clip = Catalog["items"][number];

export function clipsForFilter(catalog: Catalog, id: string): Clip[] {
  const filter = catalog.filters.find(filter => filter.id === id);
  if (!filter) return [];
  return catalog.items.filter(clip => filter.scene === null || clip.filter_id === filter.id);
}

export function clipMetadata(clip: Clip) {
  return { id: clip.id, eventTags: clip.event_tags };
}
