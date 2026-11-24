import type { Params } from "./params";

export const PUNCTUATION = { short: ",;:，；：、", sentence: ".?!…。？！" };

export function punctuation(cluster: string): "short" | "sentence" | "none" {
  if (cluster.length !== 1) return "none";
  if (PUNCTUATION.short.includes(cluster)) return "short";
  if (PUNCTUATION.sentence.includes(cluster)) return "sentence";
  return "none";
}

// One base interval before every cluster, plus the pause after the preceding mark.
export function revealTimes(clusters: readonly string[], params: Params): number[] {
  let elapsed = 0;
  return clusters.map((_, index) => {
    const mark = punctuation(clusters[index - 1] ?? "");
    const pause = mark === "short" ? params.shortPause : mark === "sentence" ? params.sentencePause : 0;
    elapsed += 1000 / params.speed + pause;
    return elapsed;
  });
}

export function visibleIndex(times: readonly number[], elapsed: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (times[mid] <= elapsed) low = mid + 1;
    else high = mid;
  }
  return low;
}
