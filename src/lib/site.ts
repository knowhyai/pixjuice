// Canonical origin for files this site writes (sprite JSON, atlas metadata, SFX notes).
// Build-time PUBLIC_SITE_URL wins; otherwise the current pages.dev host.

const DEFAULT_ORIGIN = "https://pixjuice.pages.dev";

function cleanOrigin(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return DEFAULT_ORIGIN;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return DEFAULT_ORIGIN;
    return u.origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

/** Origin with no trailing slash. */
export function siteOrigin(): string {
  return cleanOrigin(import.meta.env.PUBLIC_SITE_URL);
}
