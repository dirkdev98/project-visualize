import type { Block, Cell, DataRow, Tone } from "../model.ts";
import { changeTone, relativeChange, signedPercent } from "./change-text.ts";
import { chartTicks } from "./chart-layout.ts";
import { formatNumber } from "./number-format.ts";

export type ComparisonBlock = Extract<Block, { type: "comparison" }>;

/** One compared item: its medians per variant and its candidate ratio. */
export interface ComparisonItem {
  item: Cell;
  label: string;
  group?: string;
  unit: string;
  verdict?: string;
  tone?: Tone;
  /** Samples per variant, in `variants` order. */
  samples: { sample: Cell; value: number }[][];
  medians: (number | undefined)[];
  /** Candidate median over baseline median. */
  ratio?: number;
  /** The smallest and largest ratio of paired samples. */
  low?: number;
  high?: number;
  change?: number;
}

function text(value: Cell): string {
  return value === null
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
}
function key(value: Cell): string {
  return JSON.stringify([typeof value, value]);
}
function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Baseline, candidate, then the reference variants. */
export function comparisonVariants(block: ComparisonBlock): string[] {
  return [block.baseline, block.candidate, ...(block.references ?? [])];
}

export function compareItems(
  block: ComparisonBlock,
  rows: DataRow[],
): ComparisonItem[] {
  const source = block.source,
    variants = comparisonVariants(block);
  const cell = (row: DataRow, field: string | undefined): Cell =>
    field !== undefined && Object.hasOwn(row, field) ? row[field] : null;
  const items = new Map<string, ComparisonItem>();
  for (const row of rows) {
    const value = cell(row, source.value),
      variant = variants.indexOf(text(cell(row, source.variant)));
    if (typeof value !== "number" || variant < 0) continue;
    const item = cell(row, source.item);
    let entry = items.get(key(item));
    if (!entry) {
      entry = {
        item,
        label: text(item) || "Empty",
        unit: "",
        samples: variants.map(() => []),
        medians: [],
      };
      items.set(key(item), entry);
    }
    entry.samples[variant].push({ sample: cell(row, source.sample), value });
    const group = text(cell(row, source.group));
    if (group && entry.group === undefined) entry.group = group;
    const unit = text(cell(row, source.unit));
    if (unit && !entry.unit) entry.unit = unit;
    const verdict = text(cell(row, source.verdict));
    if (verdict && entry.verdict === undefined) entry.verdict = verdict;
  }
  for (const entry of items.values()) {
    entry.medians = entry.samples.map((samples) =>
      median(samples.map((sample) => sample.value)),
    );
    const [base, candidate] = entry.medians;
    if (base !== undefined && candidate !== undefined && base > 0) {
      entry.ratio = candidate / base;
      entry.change = relativeChange(base, candidate);
    }
    if (source.sample !== undefined) {
      const baseline = new Map(
        entry.samples[0].map((sample) => [key(sample.sample), sample.value]),
      );
      const ratios = entry.samples[1].flatMap((sample) => {
        const before = baseline.get(key(sample.sample));
        return before !== undefined && before > 0 && sample.value > 0
          ? [sample.value / before]
          : [];
      });
      if (ratios.length) {
        entry.low = Math.min(...ratios);
        entry.high = Math.max(...ratios);
      }
    }
    if (entry.verdict !== undefined && block.tones)
      entry.tone = Object.hasOwn(block.tones, entry.verdict)
        ? block.tones[entry.verdict]
        : "neutral";
  }
  return [...items.values()];
}

/** Theme colors by role; series colors by index into the chart palette. */
export type Paint =
  | "ink"
  | "muted"
  | "border"
  | "accent"
  | "positive"
  | "warning"
  | "negative"
  | { series: number };
export type Shape =
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      fill: Paint;
      alpha?: number;
      radius?: number;
    }
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: Paint;
      width: number;
      alpha?: number;
    }
  | {
      kind: "circle";
      x: number;
      y: number;
      radius: number;
      fill: Paint;
      alpha?: number;
    }
  | {
      kind: "text";
      /** The left edge for start anchors, otherwise the anchor point. */
      x: number;
      /** The top of the line box. */
      y: number;
      text: string;
      size: number;
      bold?: boolean;
      fill: Paint;
      anchor?: "start" | "middle" | "end";
    };
export interface ComparisonHit {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  tooltip: string[];
}
export type Measure = (text: string, size: number, bold?: boolean) => number;

export function shortNumber(value: number): string {
  return formatNumber(Number(value.toPrecision(4)));
}
export function ratioText(value: number): string {
  return `${Number(value.toPrecision(value >= 10 ? 3 : 2))}x`;
}

function fit(value: string, width: number, size: number, measure: Measure) {
  if (measure(value, size) <= width) return value;
  const points = Array.from(value);
  let low = 0,
    high = points.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(`${points.slice(0, middle).join("")}…`, size) <= width)
      low = middle;
    else high = middle - 1;
  }
  return low ? `${points.slice(0, low).join("")}…` : "";
}

const tonePaint = (tone: Tone | undefined, fallback: Paint): Paint =>
  tone && tone !== "neutral" ? tone : fallback;

interface Column {
  kind: "label" | "number" | "change" | "forest" | "verdict";
  title: string;
  width: number;
  x: number;
  variant?: number;
  reference?: number;
}

/**
 * Lays out the comparison as a forest of candidate/baseline ratios on a log
 * axis centred on 1x, with the selected item's samples drawn below. Both
 * renderers paint these shapes, so the viewer and exports agree.
 */
export function layoutComparison(
  block: ComparisonBlock,
  items: ComparisonItem[],
  selected: number,
  width: number,
  measure: Measure,
): { height: number; shapes: Shape[]; hits: ComparisonHit[] } {
  const shapes: Shape[] = [],
    hits: ComparisonHit[] = [];
  const variants = comparisonVariants(block);
  if (!items.length) {
    shapes.push({
      kind: "text",
      x: 0,
      y: 4,
      text: "No observations in this view.",
      size: 16,
      fill: "muted",
    });
    return { height: 28, shapes, hits };
  }
  const pad = 10,
    size = 15,
    headerSize = 13;
  const references = (block.references ?? []).map((name, i) => ({
    name,
    variant: i + 2,
  }));
  const number = (title: string, values: string[]) =>
    Math.ceil(
      Math.max(
        measure(title, headerSize, true),
        ...values.map((value) => measure(value, size)),
      ) +
        pad * 2,
    );
  const medianText = (item: ComparisonItem, variant: number) => {
    const value = item.medians[variant];
    return value === undefined ? "–" : shortNumber(value);
  };
  const gapText = (item: ComparisonItem, variant: number) => {
    const candidate = item.medians[1],
      reference = item.medians[variant];
    return candidate === undefined || reference === undefined || reference <= 0
      ? "–"
      : ratioText(candidate / reference);
  };
  const verdicts = items.some((item) => item.verdict);
  const verdictWidth = verdicts
    ? Math.ceil(
        Math.max(
          measure("Verdict", headerSize, true),
          ...items.map((item) => measure(item.verdict ?? "", 13, true) + 16),
        ) +
          pad * 2,
      )
    : 0;
  const changeWidth = number(
    "Change",
    items.map((item) =>
      item.change === undefined ? "–" : signedPercent(item.change),
    ),
  );
  const medianWidths = [0, 1].map((variant) =>
    number(
      variants[variant],
      items.map((item) => medianText(item, variant)),
    ),
  );
  const referenceWidths = references.map((reference) =>
    number(
      `vs ${reference.name}`,
      items.map((item) => gapText(item, reference.variant)),
    ),
  );
  const forestWidth = Math.round(Math.max(120, Math.min(300, width * 0.26)));
  let showMedians = true,
    showReferences = references.length > 0;
  const fixed = () =>
    changeWidth +
    forestWidth +
    verdictWidth +
    (showMedians ? medianWidths[0] + medianWidths[1] : 0) +
    (showReferences ? referenceWidths.reduce((sum, w) => sum + w, 0) : 0);
  if (width - fixed() < 160) showReferences = false;
  if (width - fixed() < 140) showMedians = false;
  const narrow = width - fixed() < 120;

  // The ratio axis is symmetric in log space, so 1x sits in the middle.
  let reach = Math.log(1.25);
  for (const item of items)
    for (const value of [item.ratio, item.low, item.high])
      if (value !== undefined && value > 0)
        reach = Math.max(reach, Math.abs(Math.log(value)));
  reach = Math.max(Math.log(1.1), reach * 1.15);
  const steps = [1.1, 1.25, 1.5, 2, 3, 5, 10, 20, 50, 100, 1000];
  const step =
    [...steps].reverse().find((value) => Math.log(value) <= reach * 0.95) ??
    1.1;
  const ticks = [1 / step, 1, step];

  const columns: Column[] = [];
  let x = 0;
  const add = (column: Omit<Column, "x">) => {
    columns.push({ ...column, x });
    x += column.width;
  };
  const labelWidth = narrow ? width : Math.max(120, width - fixed());
  if (narrow) {
    add({
      kind: "label",
      title: "",
      width: width - changeWidth - verdictWidth,
    });
    add({ kind: "change", title: "Change", width: changeWidth });
    if (verdicts)
      add({ kind: "verdict", title: "Verdict", width: verdictWidth });
  } else {
    add({ kind: "label", title: "", width: labelWidth });
    if (showMedians)
      for (const variant of [0, 1])
        add({
          kind: "number",
          title: variants[variant],
          width: medianWidths[variant],
          variant,
        });
    add({ kind: "change", title: "Change", width: changeWidth });
    add({
      kind: "forest",
      title: `${block.candidate} / ${block.baseline}`,
      width: forestWidth,
    });
    if (showReferences)
      references.forEach((reference, i) => {
        add({
          kind: "number",
          title: `vs ${reference.name}`,
          width: referenceWidths[i],
          reference: reference.variant,
        });
      });
    if (verdicts)
      add({ kind: "verdict", title: "Verdict", width: verdictWidth });
  }
  const forest = narrow
    ? { x: pad, width: width - pad * 2 }
    : (() => {
        const column = columns.find((column) => column.kind === "forest");
        return {
          x: (column?.x ?? 0) + pad,
          width: (column?.width ?? forestWidth) - pad * 2,
        };
      })();
  const ratioX = (value: number) =>
    forest.x +
    forest.width / 2 +
    (Math.max(-reach, Math.min(reach, Math.log(value))) / reach) *
      (forest.width / 2);

  // Header: column titles, with the forest title above its tick labels.
  const header = narrow ? 30 : 46;
  for (const column of columns) {
    if (narrow || column.kind === "label" || !column.title) continue;
    if (column.kind === "forest") {
      shapes.push({
        kind: "text",
        x: column.x + column.width / 2,
        y: 4,
        text: fit(column.title, column.width - pad, headerSize, measure),
        size: headerSize,
        bold: true,
        fill: "muted",
        anchor: "middle",
      });
      continue;
    }
    shapes.push({
      kind: "text",
      x:
        column.kind === "verdict"
          ? column.x + pad
          : column.x + column.width - pad,
      y: header - 22,
      text: column.title,
      size: headerSize,
      bold: true,
      fill: "muted",
      anchor: column.kind === "verdict" ? "start" : "end",
    });
  }
  const tickTop = narrow ? 8 : 24;
  for (const tick of ticks)
    shapes.push({
      kind: "text",
      x: ratioX(tick),
      y: tickTop,
      text: ratioText(tick),
      size: 12,
      fill: "muted",
      anchor: "middle",
    });
  shapes.push({
    kind: "line",
    x1: 0,
    y1: header - 0.5,
    x2: width,
    y2: header - 0.5,
    stroke: "border",
    width: 1,
  });

  // Rows, grouped in source order of each group's first item.
  const order: { group?: string; index: number }[] = [];
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const name = item.group ?? "";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)?.push(index);
  });
  for (const [group, indices] of groups)
    for (const index of indices)
      order.push({ group: group || undefined, index });
  let y = header;
  const rowHeight = narrow ? 56 : 36,
    groupHeight = 32;
  const rowsTop = y;
  let previousGroup: string | undefined;
  for (const { group, index } of order) {
    if (group !== undefined && group !== previousGroup) {
      shapes.push({
        kind: "text",
        x: pad,
        y: y + 12,
        text: fit(group, width - pad * 2, headerSize, measure),
        size: headerSize,
        bold: true,
        fill: "muted",
      });
      y += groupHeight;
    }
    previousGroup = group;
    const item = items[index],
      top = y,
      middle = narrow ? y + 18 : y + rowHeight / 2,
      lineTop = middle - size * 0.62;
    if (index === selected)
      shapes.push({
        kind: "rect",
        x: 0,
        y: top + 1,
        width,
        height: rowHeight - 2,
        fill: "accent",
        alpha: 0.12,
        radius: 6,
      });
    const changePaint: Paint = item.verdict
      ? tonePaint(item.tone, "muted")
      : tonePaint(changeTone(item.change, block.better), "muted");
    for (const column of columns) {
      const right = column.x + column.width - pad;
      if (column.kind === "label")
        shapes.push({
          kind: "text",
          x: column.x + pad,
          y: lineTop,
          text: fit(item.label, column.width - pad * 2, size, measure),
          size,
          fill: "ink",
        });
      else if (column.kind === "number")
        shapes.push({
          kind: "text",
          x: right,
          y: lineTop,
          text:
            column.reference !== undefined
              ? gapText(item, column.reference)
              : medianText(item, column.variant ?? 0),
          size,
          fill: "ink",
          anchor: "end",
        });
      else if (column.kind === "change")
        shapes.push({
          kind: "text",
          x: right,
          y: lineTop,
          text: item.change === undefined ? "–" : signedPercent(item.change),
          size,
          fill: changePaint,
          anchor: "end",
        });
      else if (column.kind === "verdict" && item.verdict) {
        const pill = measure(item.verdict, 13, true) + 16;
        shapes.push(
          {
            kind: "rect",
            x: column.x + pad,
            y: middle - 12,
            width: pill,
            height: 24,
            fill: tonePaint(item.tone, "muted"),
            alpha: 0.12,
            radius: 6,
          },
          {
            kind: "text",
            x: column.x + pad + 8,
            y: middle - 8,
            text: item.verdict,
            size: 13,
            bold: true,
            fill: tonePaint(item.tone, "muted"),
          },
        );
      }
    }
    const markY = narrow ? y + 40 : middle;
    const mark = item.verdict ? tonePaint(item.tone, "muted") : "accent";
    if (item.low !== undefined && item.high !== undefined)
      shapes.push({
        kind: "line",
        x1: ratioX(item.low),
        y1: markY,
        x2: ratioX(item.high),
        y2: markY,
        stroke: mark,
        width: 3,
        alpha: 0.45,
      });
    if (item.ratio !== undefined)
      shapes.push({
        kind: "circle",
        x: ratioX(item.ratio),
        y: markY,
        radius: 5,
        fill: mark,
      });
    shapes.push({
      kind: "line",
      x1: 0,
      y1: y + rowHeight - 0.5,
      x2: width,
      y2: y + rowHeight - 0.5,
      stroke: "border",
      width: 1,
      alpha: 0.6,
    });
    const unit = item.unit ? ` ${item.unit}` : "";
    hits.push({
      x: 0,
      y: top,
      width,
      height: rowHeight,
      index,
      tooltip: [
        item.label,
        ...variants.flatMap((name, variant) =>
          item.medians[variant] === undefined
            ? []
            : [
                `${name}: ${shortNumber(item.medians[variant] ?? 0)}${unit} (median of ${item.samples[variant].length})`,
              ],
        ),
        ...(item.ratio === undefined
          ? []
          : [
              `${block.candidate} / ${block.baseline}: ${ratioText(item.ratio)}${item.low !== undefined && item.high !== undefined ? ` (pairs ${ratioText(item.low)} to ${ratioText(item.high)})` : ""}`,
            ]),
        ...(item.verdict ? [`Verdict: ${item.verdict}`] : []),
      ],
    });
    y += rowHeight;
  }
  // Gridlines behind the marks: 1x is the reference, the others guide the eye.
  const grid: Shape[] = ticks.map((tick) => ({
    kind: "line",
    x1: ratioX(tick),
    y1: rowsTop,
    x2: ratioX(tick),
    y2: y,
    stroke: tick === 1 ? "muted" : "border",
    width: tick === 1 ? 1.5 : 1,
    alpha: tick === 1 ? 0.6 : 0.8,
  }));
  shapes.unshift(...grid);

  const chosen = items[selected];
  if (chosen) y = detail(block, chosen, y + 20, width, measure, shapes);
  return { height: Math.ceil(y + 4), shapes, hits };
}

/** The selected item's samples per variant, paired runs joined by lines. */
function detail(
  block: ComparisonBlock,
  item: ComparisonItem,
  top: number,
  width: number,
  measure: Measure,
  shapes: Shape[],
): number {
  const variants = comparisonVariants(block);
  shapes.push({
    kind: "text",
    x: 0,
    y: top,
    text: fit(item.label, width - 140, 17, measure),
    size: 17,
    bold: true,
    fill: "ink",
  });
  if (item.verdict) {
    const x = Math.min(
      width - 120,
      measure(fit(item.label, width - 140, 17, measure), 17, true) + 12,
    );
    const pill = measure(item.verdict, 13, true) + 16;
    shapes.push(
      {
        kind: "rect",
        x,
        y: top - 2,
        width: pill,
        height: 24,
        fill: tonePaint(item.tone, "muted"),
        alpha: 0.12,
        radius: 6,
      },
      {
        kind: "text",
        x: x + 8,
        y: top + 2,
        text: item.verdict,
        size: 13,
        bold: true,
        fill: tonePaint(item.tone, "muted"),
      },
    );
  }
  const values = item.samples.flat().map((sample) => sample.value);
  let min = Math.min(...values),
    max = Math.max(...values);
  const span = max === min ? Math.max(1, Math.abs(max) * 0.1) : max - min;
  min -= span * 0.12;
  max += span * 0.12;
  if (min < 0 && Math.min(...values) >= 0) min = 0;
  const ticks = chartTicks(min, max);
  const axis = Math.ceil(
    Math.max(...ticks.map((tick) => measure(shortNumber(tick), 13))) + 12,
  );
  const plotTop = top + 36,
    plotHeight = 200,
    plotLeft = axis,
    plotWidth = Math.max(40, width - axis);
  const valueY = (value: number) =>
    plotTop + plotHeight - ((value - min) / (max - min)) * plotHeight;
  for (const tick of ticks) {
    const at = valueY(tick);
    shapes.push(
      {
        kind: "line",
        x1: plotLeft,
        y1: at,
        x2: plotLeft + plotWidth,
        y2: at,
        stroke: "border",
        width: 1,
        alpha: 0.8,
      },
      {
        kind: "text",
        x: plotLeft - 8,
        y: at - 7,
        text: shortNumber(tick),
        size: 13,
        fill: "muted",
        anchor: "end",
      },
    );
  }
  const band = plotWidth / variants.length;
  const centre = (variant: number) => plotLeft + band * (variant + 0.5);
  const spread = Math.min(18, band * 0.18);
  const offset = (index: number, count: number) =>
    count < 2 ? 0 : -spread + (2 * spread * index) / (count - 1);
  const positions = item.samples.map((samples, variant) =>
    samples.map((sample, index) => ({
      sample: sample.sample,
      x: centre(variant) + offset(index, samples.length),
      y: valueY(sample.value),
    })),
  );
  // Join each paired run from baseline to candidate.
  if (block.source.sample !== undefined) {
    const candidates = new Map(
      positions[1].map((point) => [JSON.stringify(point.sample), point]),
    );
    for (const point of positions[0]) {
      const match = candidates.get(JSON.stringify(point.sample));
      if (match)
        shapes.push({
          kind: "line",
          x1: point.x,
          y1: point.y,
          x2: match.x,
          y2: match.y,
          stroke: "muted",
          width: 1.5,
          alpha: 0.35,
        });
    }
  }
  positions.forEach((points, variant) => {
    for (const point of points)
      shapes.push({
        kind: "circle",
        x: point.x,
        y: point.y,
        radius: 4.5,
        fill: { series: variant },
        alpha: 0.9,
      });
    const value = item.medians[variant];
    if (value !== undefined)
      shapes.push({
        kind: "line",
        x1: centre(variant) - spread - 10,
        y1: valueY(value),
        x2: centre(variant) + spread + 10,
        y2: valueY(value),
        stroke: { series: variant },
        width: 2.5,
      });
    shapes.push(
      {
        kind: "text",
        x: centre(variant),
        y: plotTop + plotHeight + 10,
        text: fit(variants[variant], band - 8, 13, measure),
        size: 13,
        bold: true,
        fill: "ink",
        anchor: "middle",
      },
      {
        kind: "text",
        x: centre(variant),
        y: plotTop + plotHeight + 28,
        text:
          value === undefined
            ? "No samples"
            : fit(
                `${shortNumber(value)}${item.unit ? ` ${item.unit}` : ""}`,
                band - 8,
                13,
                measure,
              ),
        size: 13,
        fill: "muted",
        anchor: "middle",
      },
    );
  });
  return plotTop + plotHeight + 48;
}
