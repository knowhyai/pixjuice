import { buildShareUrl } from "../feel/share";
import { labJson, labToken, paramsForLab, parseLabTune, type LabLimits, type LabMode } from "../feel/lab-tune";
import { t } from "../lib/i18n";

/** Bind the identical tune controls on the camera and spring pages. */
export function bindSmallLab<P extends Record<string, number>>(options: {
  prefix: string;
  defaults: Readonly<P>;
  starter: Readonly<P>;
  limits: LabLimits<P>;
  reset: () => void;
}): () => Readonly<P> {
  const { prefix, defaults, starter, limits, reset } = options;
  const tune = parseLabTune(location.search, prefix, { ...starter }, limits);
  let mode: LabMode = "mine";
  const code = document.querySelector<HTMLElement>("#lab-code")!;
  const link = document.querySelector<HTMLInputElement>("#lab-share-link")!;
  const share = document.querySelector<HTMLButtonElement>("#lab-share")!;
  const modes = document.querySelectorAll<HTMLButtonElement>("[data-lab-mode]");
  const active = () => paramsForLab(tune, defaults, mode);

  function refresh(): void {
    for (const button of modes) button.setAttribute("aria-pressed", String(button.dataset.labMode === mode));
    code.textContent = labJson(active());
    link.hidden = true;
  }

  for (const button of modes) button.addEventListener("click", () => {
    mode = button.dataset.labMode as LabMode;
    refresh();
    reset();
  });

  for (const input of document.querySelectorAll<HTMLInputElement>("[data-lab-param]")) {
    const key = input.dataset.labParam as keyof P;
    const [min, max, step] = limits[key];
    const output = input.closest("label")!.querySelector("output")!;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(tune[key]);
    output.value = input.value;
    input.addEventListener("input", () => {
      tune[key] = input.valueAsNumber as P[typeof key];
      if (mode !== "mine") {
        mode = "mine";
        reset();
      }
      output.value = input.value;
      refresh();
    });
  }

  document.querySelector("#lab-reset")!.addEventListener("click", reset);
  document.querySelector("#lab-json")!.addEventListener("click", () => {
    const href = URL.createObjectURL(new Blob([labJson(active())], { type: "application/json" }));
    const download = document.createElement("a");
    download.href = href;
    download.download = prefix.replace(/1$/, "") + "-tune.json";
    download.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });

  share.addEventListener("click", async () => {
    const { origin, pathname, search, hash } = location;
    const url = buildShareUrl(origin, pathname, search, hash, labToken(prefix, tune));
    try {
      await navigator.clipboard.writeText(url);
      link.hidden = true;
      share.textContent = t("feel.shareDone");
      setTimeout(() => { share.textContent = t("feel.share"); }, 1400);
    } catch {
      link.value = url;
      link.hidden = false;
      link.select();
    }
  });

  refresh();
  return active;
}
