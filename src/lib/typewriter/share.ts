import { checkText } from "./graphemes";
import { parseParams, type Configuration } from "./params";

export const SHARE_PARAM = "typewriter";
export const SHARE_CAPS = { tokenChars: 1800, urlChars: 2048 } as const;
export const VERSION = 1;

export function serialize(config: Configuration): string {
  const { speed, shortPause, sentencePause } = config.mine.params;
  return JSON.stringify({
    version: VERSION, mode: config.mode,
    mine: { params: { speed, shortPause, sentencePause }, text: config.mine.text },
  });
}

function parseRawConfiguration(serialized: string): Configuration | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== "object" || value === null || !("version" in value) || value.version !== VERSION
      || !("mode" in value) || (value.mode !== "default" && value.mode !== "mine")
      || !("mine" in value) || typeof value.mine !== "object" || value.mine === null
      || !("params" in value.mine) || !("text" in value.mine) || typeof value.mine.text !== "string") return null;
    const params = parseParams(value.mine.params);
    if (!params || checkText(value.mine.text).kind !== "complete") return null;
    return { mode: value.mode, mine: { params, text: value.mine.text } };
  } catch {
    return null;
  }
}

function normalizeLineEndings(config: Configuration): Configuration {
  return { ...config, mine: { ...config.mine, text: config.mine.text.replace(/\r\n?/g, "\n") } };
}

export function parseConfiguration(serialized: string): Configuration | null {
  const config = parseRawConfiguration(serialized);
  return config && normalizeLineEndings(config);
}

function encode(config: Configuration): string {
  const bytes = new TextEncoder().encode(serialize(config));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeShare(token: string): Configuration | null {
  if (token.length > SHARE_CAPS.tokenChars || !/^[\w-]+$/.test(token)) return null;
  try {
    const bytes = Uint8Array.from(atob(token.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
    const config = parseRawConfiguration(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    // Check the original payload before normalizing legacy line endings.
    return config && encode(config) === token ? normalizeLineEndings(config) : null;
  } catch {
    return null;
  }
}

export function buildShareUrl(base: string, config: Configuration): string | null {
  if (!parseParams(config.mine.params) || checkText(config.mine.text).kind !== "complete") return null;
  const token = encode(config);
  if (token.length > SHARE_CAPS.tokenChars) return null;
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set(SHARE_PARAM, token);
  return url.href.length <= SHARE_CAPS.urlChars ? url.href : null;
}

export function readShareUrl(url: URL): Configuration | null {
  if (url.href.length > SHARE_CAPS.urlChars) return null;
  const tokens = url.searchParams.getAll(SHARE_PARAM);
  return tokens.length === 1 ? decodeShare(tokens[0]) : null;
}

export function resolveIncomingShare(url: URL) {
  const config = readShareUrl(url);
  if (config || !url.searchParams.has(SHARE_PARAM)) {
    return { config, notice: null, cleanedUrl: null };
  }
  const cleanedUrl = new URL(url);
  cleanedUrl.searchParams.delete(SHARE_PARAM);
  return { config: null, notice: "invalidShare" as const, cleanedUrl };
}
