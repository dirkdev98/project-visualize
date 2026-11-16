import type { Series } from "../model.ts";

export interface PlotSeries {
  x: Float64Array;
  y: Float64Array;
}
export function barAt(
  rendered: PlotSeries[],
  source: Series[],
  hidden: boolean[],
  point: { x: number; y: number },
  width: number,
  toleranceY = 0,
  baseline = 0,
): number | undefined {
  for (let i = rendered.length - 1; i >= 0; i--) {
    if (hidden[i]) continue;
    const { x, y } = rendered[i];
    for (let j = 0; j < x.length; j++)
      if (
        Math.abs(point.x - x[j]) <= width / 2 &&
        point.y >= Math.min(baseline, y[j]) - toleranceY &&
        point.y <= Math.max(baseline, y[j]) + toleranceY
      )
        return source[i].x?.[j] ?? j;
  }
}
