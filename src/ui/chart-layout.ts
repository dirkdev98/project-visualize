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

/** How a chart's value axis maps and where its bars or shading start. */
export interface ValueScale {
  log?: boolean;
  /** Bars and area shading grow from this value; zero by default, or one on a log axis. */
  baseline?: number;
  /** Values the axis must show, such as reference lines. */
  references?: readonly number[];
}

export function valueBaseline(scale: ValueScale = {}): number {
  return scale.baseline ?? (scale.log ? 1 : 0);
}

/**
 * The fitted view of a chart. Bars get room for their full width and keep
 * their baseline flush with the frame; other kinds pad both axes. A log axis
 * pads in log space. Both renderers start from these bounds so their axes and
 * ticks agree.
 */
export function chartBounds(
  points: readonly { x: number; y: number }[],
  kind: "line" | "area" | "bar" | "scatter",
  scale: ValueScale = {},
): ChartBounds {
  const xWhole = points.every((point) => Number.isInteger(point.x)),
    yWhole =
      !scale.log &&
      points.every((point) => Number.isInteger(point.y)) &&
      (scale.references ?? []).every(Number.isInteger);
  const forward = (value: number) => (scale.log ? Math.log10(value) : value),
    inverse = (value: number) => (scale.log ? 10 ** value : value);
  if (!points.length)
    return {
      xmin: 0,
      xmax: 1,
      ymin: scale.log ? 1 : 0,
      ymax: scale.log ? 10 : 1,
      xWhole,
      yWhole,
    };
  const ys = [
    ...points.map((point) => forward(point.y)),
    ...(scale.references ?? []).map(forward),
  ];
  let xmin = Math.min(...points.map((point) => point.x)),
    xmax = Math.max(...points.map((point) => point.x)),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const base = forward(valueBaseline(scale));
  if (kind === "bar" || kind === "area") {
    ymin = Math.min(base, ymin);
    ymax = Math.max(base, ymax);
  }
  const dx = xmax === xmin ? 1 : xmax - xmin,
    dy = ymax === ymin ? Math.max(1, Math.abs(ymax) * 0.1) : ymax - ymin;
  xmin -= kind === "bar" ? 0.6 : dx * 0.06;
  xmax += kind === "bar" ? 0.6 : dx * 0.06;
  ymin = kind === "bar" && ymin === base ? ymin : ymin - dy * 0.1;
  ymax = kind === "bar" && ymax === base ? ymax : ymax + dy * 0.1;
  if (ymin === ymax) ymax = ymin + 1;
  return {
    xmin,
    xmax,
    ymin: inverse(ymin),
    ymax: inverse(ymax),
    xWhole,
    yWhole,
  };
}

/**
 * Ticks of a log axis: the sparsest of 1, 1-2-5 and finer steps per decade
 * that gives at least three ticks, or linear ticks within one narrow decade.
 */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > min)) return [];
  const steps = [[1], [1, 2, 5], [1, 1.5, 2, 3, 5, 7]];
  for (const mantissas of steps) {
    const values: number[] = [];
    for (
      let power = Math.floor(Math.log10(min));
      power <= Math.ceil(Math.log10(max));
      power++
    )
      for (const mantissa of mantissas) {
        const value = Number((mantissa * 10 ** power).toPrecision(12));
        if (value >= min * 0.9999 && value <= max * 1.0001) values.push(value);
      }
    if (values.length >= 3)
      return values.length > 12
        ? values.filter((_, i) => i % Math.ceil(values.length / 8) === 0)
        : values;
  }
  return chartTicks(min, max).filter((value) => value > 0);
}

/** Ticks for a value axis on either scale. */
export function valueTicks(
  min: number,
  max: number,
  integer: boolean,
  log = false,
): number[] {
  return log ? logTicks(min, max) : chartTicks(min, max, integer);
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
