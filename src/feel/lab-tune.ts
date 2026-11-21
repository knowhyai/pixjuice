// Shared only by the camera and spring pages. Their params are integer sliders.
export type LabMode = "mine" | "default";
export type LabLimits<P> = { [K in keyof P]: readonly [min: number, max: number, step: number] };

export function parseLabTune<P extends Record<string, number>>(
  search: string, prefix: string, defaults: P, limits: LabLimits<P>,
): P {
  const token = new URLSearchParams(search).get("tune");
  if (!token?.startsWith(prefix + ":") || token.length > 512) return { ...defaults };
  try {
    const values: Record<string, unknown> | null = JSON.parse(token.slice(prefix.length + 1));
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof P)[]) {
      const value = values?.[key as string];
      const [min, max, step] = limits[key];
      if (typeof value !== "number" || value < min || value > max || (value - min) % step !== 0) return { ...defaults };
      result[key] = value as P[typeof key];
    }
    return result;
  } catch {
    return { ...defaults };
  }
}

export function paramsForLab<P>(tune: P, defaults: Readonly<P>, mode: LabMode): Readonly<P> {
  return mode === "default" ? defaults : tune;
}

export function labToken(prefix: string, tune: Record<string, number>): string {
  return prefix + ":" + JSON.stringify(tune);
}

export function labJson(params: Readonly<Record<string, number>>): string {
  return JSON.stringify(params, null, 2);
}
