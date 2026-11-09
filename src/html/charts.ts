import type { Block, Cell, Series, Theme } from "../model.ts";
import { chartColors } from "../palette.ts";
import {
  analyticalRange,
  chartBounds,
  chartTicks,
  crowdedCategories,
} from "../ui/chart-layout.ts";
import { formatNumber } from "../ui/number-format.ts";
import {
  boxplot,
  histogram,
  waterfall,
  waterfallGroups,
} from "../ui/statistics.ts";
import { escapeHtml, label, svg, wrap } from "./markup.ts";

type Chart = Extract<Block, { type: "chart" }>;
export interface PlotState {
  hidden: string[];
  zoom: number;
  x: number;
  y: number;
}
export const defaultPlot = (): PlotState => ({
  hidden: [],
  zoom: 1,
  x: 0,
  y: 0,
});
const number = (value: number) => formatNumber(Number(value.toPrecision(4)));

export function plot(
  block: Chart,
  width: number,
  theme: Theme,
  key: string,
  state: PlotState,
  selection?: {
    control: string;
    values: Cell[];
    selected: Cell | { all: true } | { min?: number; max?: number };
  },
  measure: (value: string, size: number) => number = (value, size) =>
    value.length * size * 0.4,
): string {
  const all = block.series ?? [];
  if (!all.length)
    return `<div class="pv-empty" style="height:${block.height ?? 300}px">No data matches the controls.</div>`;
  const series = all.filter((item) => !state.hidden.includes(item.name));
  const colors = chartColors(theme);
  const coordinates = series.flatMap((item) =>
    item.values.map((y, index) => ({ x: item.x?.[index] ?? index, y })),
  );
  const horizontal =
    block.kind === "bar" &&
    !!block.labels?.length &&
    crowdedCategories(
      block.labels.map((value) => measure(value, 18)),
      width - 100,
    );
  const labelWidth = Math.max(60, Math.min(260, width * 0.35));
  const labelLines = horizontal
    ? (block.labels ?? []).map((value) => wrap(value, labelWidth, 18, measure))
    : [];
  const rowHeight =
    Math.max(18, ...labelLines.map((lines) => lines.length * 18)) + 10;
  const xLabel = horizontal ? block.yLabel : block.xLabel,
    yLabel = horizontal ? block.xLabel : block.yLabel;
  const requestedHeight = horizontal
    ? Math.max(
        block.height ?? 300,
        Math.min(1200, (block.labels?.length ?? 1) * rowHeight + 100),
      )
    : (block.height ?? 300);
  const height = Math.max(80, requestedHeight - 29);
  const margin = {
    left: horizontal ? labelWidth + 26 : 64,
    right: 18,
    top: 18,
    bottom: xLabel ? 64 : 45,
  };
  const pw = Math.max(20, width - margin.left - margin.right),
    ph = Math.max(30, height - margin.top - margin.bottom);
  let { xmin, xmax, ymin, ymax, xWhole, yWhole } = chartBounds(
    coordinates,
    block.kind,
  );
  const centerX = (xmin + xmax) / 2 + state.x * (xmax - xmin),
    centerY = (ymin + ymax) / 2 + state.y * (ymax - ymin);
  const spanX = (xmax - xmin) / state.zoom,
    spanY = (ymax - ymin) / state.zoom;
  xmin = centerX - spanX / 2;
  xmax = centerX + spanX / 2;
  ymin = centerY - spanY / 2;
  ymax = centerY + spanY / 2;
  const x = (value: number) =>
    margin.left + ((value - xmin) / (xmax - xmin)) * pw;
  const y = (value: number) =>
    margin.top + ph - ((value - ymin) / (ymax - ymin)) * ph;
  const hx = (value: number) =>
    margin.left + ((value - ymin) / (ymax - ymin)) * pw;
  const hy = (value: number) =>
    margin.top + ((value - xmin) / (xmax - xmin)) * ph;
  let drawing = `<rect x="${margin.left}" y="${margin.top}" width="${pw}" height="${ph}" fill="var(--pv-surface)" stroke="var(--pv-border)"/>`;
  for (const value of chartTicks(ymin, ymax, yWhole)) {
    if (horizontal) {
      const at = hx(value);
      drawing += `<path d="M${at},${margin.top}v${ph}" stroke="var(--pv-border)" stroke-width=".7"/>${label(at, margin.top + ph + 20, number(value), 18)}`;
    } else {
      const at = y(value);
      drawing += `<path d="M${margin.left},${at}h${pw}" stroke="var(--pv-border)" stroke-width=".7"/>${label(margin.left - 8, at + 5, number(value), 18, "end")}`;
    }
  }
  const xticks =
    block.labels?.map((value, index) => ({ value, at: index })) ??
    chartTicks(xmin, xmax, xWhole).map((at) => ({ value: number(at), at }));
  const stride = horizontal
    ? Math.max(
        1,
        Math.ceil(
          (labelLines.length *
            (Math.max(...labelLines.map((lines) => lines.length * 18)) + 4)) /
            ph,
        ),
      )
    : Math.max(1, Math.ceil(xticks.length / Math.max(1, Math.floor(pw / 80))));
  xticks.forEach((tick, index) => {
    if (index % stride) return;
    if (horizontal) {
      const lines = labelLines[index],
        at = margin.left - 10;
      drawing += `<text x="${at}" y="${hy(tick.at) + 5 - (lines.length - 1) * 9}" text-anchor="end" font-size="18" fill="var(--pv-muted)">${lines.map((line, index) => `<tspan x="${at}" dy="${index ? 18 : 0}">${escapeHtml(line)}</tspan>`).join("")}</text>`;
    } else if (x(tick.at) >= margin.left && x(tick.at) <= width - margin.right)
      drawing += label(x(tick.at), margin.top + ph + 20, tick.value, 18);
  });
  if (xLabel) {
    const size = Math.min(
        18,
        ((width - 12) / Math.max(1, measure(xLabel, 18))) * 18,
      ),
      half = measure(xLabel, size) / 2 + 6;
    drawing += label(
      Math.max(half, Math.min(width - half, margin.left + pw / 2)),
      height - 6,
      xLabel,
      size,
    );
  }
  if (yLabel)
    drawing += label(
      14,
      height / 2,
      yLabel,
      Math.min(18, ((height - 12) / Math.max(1, measure(yLabel, 18))) * 18),
      "middle",
      `transform="rotate(-90 14 ${height / 2})"`,
    );
  const clip = `clip-${key}`;
  drawing += `<defs><clipPath id="${escapeHtml(clip)}"><rect x="${margin.left}" y="${margin.top}" width="${pw}" height="${ph}"/></clipPath></defs><g clip-path="url(#${escapeHtml(clip)})">`;
  for (const item of series) {
    const color = colors[all.indexOf(item) % colors.length];
    const points = item.values.map((value, index) => ({
      x: item.x?.[index] ?? index,
      y: value,
    }));
    if (block.kind === "area" && points.length) {
      drawing += `<path d="M${x(points[0].x)},${y(0)} ${points.map((p) => `L${x(p.x)},${y(p.y)}`).join(" ")} L${x(points[points.length - 1].x)},${y(0)}Z" fill="${color}" fill-opacity="${theme === "light" ? 0.13 : 0.22}"/>`;
    }
    if (block.kind === "line" || block.kind === "area")
      drawing += `<path d="${points.map((point, index) => `${index ? "L" : "M"}${x(point.x)},${y(point.y)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    points.forEach((point) => {
      const category = block.labels?.[point.x] ?? number(point.x);
      const tooltip = `${item.name} · ${category}: ${number(point.y)}`;
      const selected =
        selection &&
        JSON.stringify(selection.selected) ===
          JSON.stringify(selection.values[point.x]);
      const attributes = `data-tooltip="${escapeHtml(tooltip)}"${selection ? ` role="button" tabindex="0" aria-label="${escapeHtml(tooltip)}" aria-pressed="${!!selected}" data-select="${escapeHtml(selection.control)}" data-value="${escapeHtml(JSON.stringify(selection.values[point.x]))}"` : ""}`;
      if (block.kind === "bar") {
        const band = 0.8 / Math.max(1, series.length),
          position = point.x - 0.4 + band * series.indexOf(item);
        const left = horizontal ? Math.min(hx(0), hx(point.y)) : x(position),
          top = horizontal ? hy(position) : Math.min(y(0), y(point.y));
        const w = horizontal
            ? Math.abs(hx(point.y) - hx(0))
            : x(position + band) - x(position),
          h = horizontal
            ? hy(position + band) - hy(position)
            : Math.abs(y(point.y) - y(0));
        drawing += `<rect x="${left}" y="${top}" width="${Math.max(0.5, w)}" height="${Math.max(0.5, h)}" fill="${color}" fill-opacity="${selection && !selected && !(typeof selection.selected === "object" && selection.selected !== null && "all" in selection.selected) ? 0.4 : 1}" stroke="${selected ? "var(--pv-ink)" : "none"}" stroke-width="2" ${attributes}><title>${escapeHtml(tooltip)}</title></rect>`;
      } else
        drawing += `<circle cx="${x(point.x)}" cy="${y(point.y)}" r="${block.kind === "scatter" || points.length === 1 ? 4 : 3}" fill="${color}" ${attributes}><title>${escapeHtml(tooltip)}</title></circle>`;
    });
  }
  drawing += "</g>";
  if (!coordinates.length)
    drawing += label(
      margin.left + pw / 2,
      margin.top + ph / 2,
      "No observations",
      16,
    );
  const legend = all
    .map(
      (item, index) =>
        `<button type="button" data-series="${escapeHtml(item.name)}" aria-pressed="${!state.hidden.includes(item.name)}"><i style="background:${colors[index % colors.length]}"></i>${escapeHtml(item.name)}</button>`,
    )
    .join("");
  return `<figure class="pv-plot" data-plot="${escapeHtml(key)}"${selection ? ` data-clear="${escapeHtml(selection.control)}"` : ""}>${svg(width, height, block.title ?? `${block.kind} chart`, drawing)}<div class="pv-legend">${legend}</div><div class="pv-zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="fit" aria-label="Fit chart">⌖</button></div></figure>`;
}

export function analytical(
  block: Extract<Block, { type: "histogram" | "boxplot" | "waterfall" }>,
  width: number,
  theme: Theme,
  key: string,
  state: PlotState,
  measure: (value: string, size: number) => number = (value, size) =>
    value.length * size * 0.4,
): string {
  if (block.type === "histogram") {
    const series = block.series ?? [],
      prepared = histogram(
        series.map((item) => item.values),
        block.bins,
      );
    if (!prepared.boundaries.length)
      return '<p class="pv-empty">No observations in this view.</p>';
    const labels = prepared.boundaries
      .slice(0, -1)
      .map(
        (value, index) =>
          `${number(value)}–${number(prepared.boundaries[index + 1])}`,
      );
    return plot(
      {
        type: "chart",
        kind: "bar",
        height: block.height,
        title: block.title,
        labels,
        xLabel: block.xLabel,
        yLabel: block.yLabel ?? "Count",
        series: series.map((item, index) => ({
          name: item.name,
          values: prepared.counts[index],
        })),
      },
      width,
      theme,
      key,
      state,
      undefined,
      measure,
    );
  }
  const height = Math.max(80, (block.height ?? 300) - 29),
    left = 60,
    top = 20;
  const pw = Math.max(20, width - left - 20),
    ph = Math.max(25, height - 65);
  const colors = chartColors(theme);
  const series: Series[] = block.type === "boxplot" ? (block.series ?? []) : [];
  const boxes = series.map((item) => boxplot(item.values));
  if (block.type === "boxplot" && !boxes.some(Boolean))
    return '<p class="pv-empty">No observations in this view.</p>';
  const layout = block.type === "waterfall" ? waterfall(block.steps) : null;
  const steps = layout?.bars ?? [];
  const values = layout
    ? [layout.low, layout.high]
    : series
        .filter((item) => !state.hidden.includes(item.name))
        .flatMap((item) => item.values);
  let { low, high } = analyticalRange(values, block.type === "waterfall");
  const center = (low + high) / 2 + state.y * (high - low),
    half = (high - low) / 2 / state.zoom;
  low = center - half;
  high = center + half;
  const y = (value: number) => top + ph - ((value - low) / (high - low)) * ph;
  const count = block.type === "boxplot" ? series.length : steps.length,
    band = (pw / Math.max(1, count)) * state.zoom;
  const x = (index: number) =>
    left + pw / 2 + (index + 0.5 - count / 2 - state.x * count) * band;
  let drawing = `<rect x="${left}" y="${top}" width="${pw}" height="${ph}" fill="var(--pv-surface)" stroke="var(--pv-border)"/>`;
  for (const value of chartTicks(
    low,
    high,
    block.type === "boxplot" && values.every(Number.isInteger),
  ))
    drawing += `<path d="M${left},${y(value)}h${pw}" stroke="var(--pv-border)" stroke-width=".7"/>${label(left - 7, y(value) + 4, number(value), 18, "end")}`;
  if (block.yLabel)
    drawing += label(
      18,
      top + ph / 2,
      block.yLabel,
      14,
      "middle",
      `transform="rotate(-90 14 ${top + ph / 2})"`,
    );
  const names =
    block.type === "boxplot"
      ? series.map((item) => item.name)
      : block.steps.map((step) => step.label);
  names.forEach((name, index) => {
    if (x(index) >= left && x(index) <= width - 20)
      drawing += label(x(index), height - 19, name, 18);
  });
  const clip = `analytical-${key}`;
  drawing += `<defs><clipPath id="${clip}"><rect x="${left}" y="${top}" width="${pw}" height="${ph}"/></clipPath></defs><g clip-path="url(#${clip})">`;
  if (block.type === "boxplot")
    boxes.forEach((box, index) => {
      if (!box || state.hidden.includes(series[index].name)) return;
      const at = x(index),
        w = band * 0.45,
        color = colors[index % colors.length];
      drawing += `<g data-tooltip="${escapeHtml(`${series[index].name}: median ${number(box.median)}, Q1 ${number(box.q1)}, Q3 ${number(box.q3)}`)}"><path d="M${at},${y(box.low)}V${y(box.high)} M${at - w / 3},${y(box.low)}h${(w * 2) / 3} M${at - w / 3},${y(box.high)}h${(w * 2) / 3}" stroke="${color}"/><rect x="${at - w / 2}" y="${y(box.q3)}" width="${w}" height="${Math.max(1, y(box.q1) - y(box.q3))}" fill="${color}" fill-opacity=".2" stroke="${color}"/><path d="M${at - w / 2},${y(box.median)}h${w}" stroke="${color}" stroke-width="2"/>${box.outliers.map((value) => `<circle cx="${at}" cy="${y(value)}" r="3" fill="${color}"/>`).join("")}</g>`;
    });
  const groupColors = {
    increase: "var(--pv-positive)",
    decrease: "var(--pv-negative)",
    total: colors[0],
  };
  const groups = waterfallGroups.filter((group) =>
    steps.some((step) => step.group === group.id),
  );
  steps.forEach((step, index) => {
    const at = x(index) - band * 0.3,
      w = band * 0.6;
    if (index + 1 < steps.length)
      drawing += `<path d="M${at + w},${y(step.end)}h${band - w}" stroke="var(--pv-muted)" stroke-dasharray="4 3"/>`;
    const group = groups.find((item) => item.id === step.group);
    if (!group || state.hidden.includes(group.name)) return;
    const top = y(Math.max(step.start, step.end)),
      bottom = y(Math.min(step.start, step.end));
    drawing += `<rect x="${at}" y="${top}" width="${w}" height="${Math.max(1, bottom - top)}" fill="${groupColors[step.group]}" data-tooltip="${escapeHtml(`${names[index]}: ${step.label}`)}"/>`;
    drawing += `<text x="${at + w / 2}" y="${step.below ? bottom + 19 : top - 6}" text-anchor="middle" font-size="16" fill="var(--pv-ink)">${escapeHtml(step.label)}</text>`;
  });
  drawing += "</g>";
  if (!values.length)
    drawing += label(left + pw / 2, top + ph / 2, "No observations", 16);
  const legendEntries = layout
    ? groups.map((group) => ({
        name: group.name,
        color: groupColors[group.id],
      }))
    : series.map((item, index) => ({
        name: item.name,
        color: colors[index % colors.length],
      }));
  const legend = legendEntries
    .map(
      ({ name, color }) =>
        `<button type="button" data-series="${escapeHtml(name)}" aria-pressed="${!state.hidden.includes(name)}"><i style="background:${color}"></i>${escapeHtml(name)}</button>`,
    )
    .join("");
  return `<figure class="pv-plot" data-plot="${escapeHtml(key)}">${svg(width, height, block.title ?? block.type, drawing)}<div class="pv-legend">${legend}</div><div class="pv-zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="fit" aria-label="Fit chart">⌖</button></div></figure>`;
}
