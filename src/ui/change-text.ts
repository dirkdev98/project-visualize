import type { Block, Cell, NumberFormat, Tone } from "../model.ts";
import { formatNumber } from "./number-format.ts";

/** Signed relative change in percent, or undefined without a nonzero start. */
export function relativeChange(from: Cell, to: Cell): number | undefined {
  if (typeof from !== "number" || typeof to !== "number" || from === 0)
    return undefined;
  return ((to - from) / Math.abs(from)) * 100;
}

export function signedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(
    Math.abs(rounded) >= 100 ? 0 : 1,
  )}%`;
}

/** The tone of a change: an improvement is positive, a regression negative. */
export function changeTone(
  change: number | undefined,
  better: "lower" | "higher" | undefined,
): Tone {
  if (change === undefined || !better || Math.round(change * 10) === 0)
    return "neutral";
  return change < 0 === (better === "lower") ? "positive" : "negative";
}

type Metric = Extract<Block, { type: "metric" }>;

/** A range with its unit once, such as "43.2–45.0 s". */
export function formatRange(
  low: number,
  high: number,
  format: NumberFormat = {},
): string {
  return `${formatNumber(low, { ...format, suffix: undefined })}–${formatNumber(high, { ...format, prefix: undefined })}`;
}

/** The parts of a metric's comparison line, such as "was 155 · −47.1%". */
export function metricComparison(
  metric: Metric,
  value: Cell,
): { text: string; tone?: Tone }[] {
  const parts: { text: string; tone?: Tone }[] = [];
  if (metric.previous !== undefined) {
    parts.push({ text: `was ${formatNumber(metric.previous, metric)}` });
    const change = relativeChange(metric.previous, value);
    if (change !== undefined)
      parts.push({
        text: signedPercent(change),
        tone: changeTone(change, metric.better),
      });
  }
  if (metric.low !== undefined && metric.high !== undefined)
    parts.push({
      text: `range ${formatRange(metric.low, metric.high, metric)}`,
    });
  return parts;
}

/** The total a metric's value belongs to, such as " of 16". */
export function metricTotal(metric: Metric): string {
  return metric.of === undefined
    ? ""
    : ` of ${formatNumber(metric.of, { decimals: metric.decimals })}`;
}
