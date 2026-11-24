export const INPUT_CAPS = { graphemes: 600, utf16Units: 4096 } as const;
const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export type TextCheck =
  | { kind: "complete"; clusters: readonly string[] }
  | { kind: "incomplete" }
  | { kind: "unsupported" };

export function checkText(text: string): TextCheck {
  if (!segmenter) return { kind: "unsupported" };
  if (text.length > INPUT_CAPS.utf16Units) return { kind: "incomplete" };
  const clusters: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    if (clusters.length === INPUT_CAPS.graphemes) return { kind: "incomplete" };
    clusters.push(segment);
  }
  return { kind: "complete", clusters };
}

export function visibleText(clusters: readonly string[], count: number): string {
  return clusters.slice(0, count).join("");
}
