import { checkText, INPUT_CAPS } from "./graphemes";
import { paramsForMode, type Configuration } from "./params";
import { buildShareUrl, SHARE_CAPS, VERSION } from "./share";

export function exportJson(config: Configuration, base: string): string {
  const { mode, mine } = config;
  const { params, text } = paramsForMode(mine, mode);
  const checked = checkText(text);
  return JSON.stringify({
    name: "pixjuice-typewriter", version: VERSION, preview: "browser-local",
    mode, params, text, inputCaps: INPUT_CAPS, shareCaps: SHARE_CAPS,
    graphemeCount: checked.kind === "complete" ? checked.clusters.length : null,
    shareWouldBeComplete: buildShareUrl(base, config) !== null,
  }, null, 2) + "\n";
}
