export function crowdedCategories(
  widths: readonly number[],
  plotWidth: number,
) {
  if (!widths.length) return false;
  const spacing = Math.max(1, plotWidth) / (widths.length + 1);
  if (widths.length === 1) return widths[0] > plotWidth;
  return widths.some(
    (width, i) => i > 0 && (widths[i - 1] + width) / 2 + 12 > spacing,
  );
}

export interface ChartBounds {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  /** Whether every x or y value is a whole number, which keeps ticks whole. */
  xWhole: boolean;
  yWhole: boolean;
}

/**
 * The fitted view of a chart. Bars get room for their full width and keep a
 * zero baseline flush with the frame; other kinds pad both axes. Both
 * renderers start from these bounds so their axes and ticks agree.
 */
export function chartBounds(
  points: readonly { x: number; y: number }[],
  kind: "line" | "area" | "bar" | "scatter",
): ChartBounds {
  const xWhole = points.every((point) => Number.isInteger(point.x)),
    yWhole = points.every((point) => Number.isInteger(point.y));
  if (!points.length)
    return { xmin: 0, xmax: 1, ymin: 0, ymax: 1, xWhole, yWhole };
  let xmin = Math.min(...points.map((point) => point.x)),
    xmax = Math.max(...points.map((point) => point.x)),
    ymin = Math.min(...points.map((point) => point.y)),
    ymax = Math.max(...points.map((point) => point.y));
  if (kind === "bar" || kind === "area") {
    ymin = Math.min(0, ymin);
    ymax = Math.max(0, ymax);
  }
  const dx = xmax === xmin ? 1 : xmax - xmin,
    dy = ymax === ymin ? Math.max(1, Math.abs(ymax) * 0.1) : ymax - ymin;
  xmin -= kind === "bar" ? 0.6 : dx * 0.06;
  xmax += kind === "bar" ? 0.6 : dx * 0.06;
  ymin = kind === "bar" && ymin === 0 ? 0 : ymin - dy * 0.1;
  ymax = kind === "bar" && ymax === 0 ? 0 : ymax + dy * 0.1;
  if (ymin === ymax) ymax = ymin + 1;
  return { xmin, xmax, ymin, ymax, xWhole, yWhole };
}

/**
 * Round tick values, about five across the range. Whole-number data such as
 * counts keeps whole-number ticks.
 */
export function chartTicks(
  min: number,
  max: number,
  integer = false,
): number[] {
  const raw = (max - min) / 5,
    power = 10 ** Math.floor(Math.log10(raw)),
    scaled = raw / power;
  const nice =
    (scaled < 1.5 ? 1 : scaled < 3 ? 2 : scaled < 7 ? 5 : 10) * power;
  const step = integer ? Math.max(1, nice) : nice;
  if (!Number.isFinite(step) || step <= 0) return [];
  const values: number[] = [];
  for (
    let value = Math.ceil(min / step) * step;
    value <= max + step * 0.001;
    value += step
  )
    values.push(
      Math.abs(value) < step * 0.001 ? 0 : Number(value.toPrecision(12)),
    );
  return values;
}

/**
 * Value range of a box plot or waterfall with 10% padding. A waterfall that
 * never goes below zero keeps its baseline on the frame.
 */
export function analyticalRange(
  values: readonly number[],
  zeroBaseline: boolean,
) {
  const min = values.length ? Math.min(...values) : 0,
    max = values.length ? Math.max(...values) : 1,
    span = max === min ? Math.max(1, Math.abs(max) * 0.1) : max - min;
  return {
    low: zeroBaseline && min === 0 ? 0 : min - span * 0.1,
    high: max + span * 0.1,
  };
}
