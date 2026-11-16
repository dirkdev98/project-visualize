import type { Parameters } from "../data.ts";
import {
  ALL,
  choices,
  createParameters,
  isAll,
  labels,
  numericBounds,
  parameterValue,
  resolveView,
} from "../data.ts";
import type {
  Artifact,
  Block,
  ControlBlock,
  DataRow,
  ParameterValue,
  TableColumn,
  Theme,
} from "../model.ts";
import { chartColors, palettes } from "../palette.ts";
import { metricComparison, metricTotal } from "../ui/change-text.ts";
import { formatNumber } from "../ui/number-format.ts";
import {
  compareCells,
  searchText,
  sortValue,
  statusSummary,
  tableCell,
} from "../ui/table-cells.ts";
import { analytical, defaultPlot, type PlotState, plot } from "./charts.ts";
import { comparison } from "./comparisons.ts";
import { diagram, type Measure } from "./diagrams.ts";
import { escapeHtml, markdown } from "./markup.ts";

export interface HtmlPayload {
  document: Artifact;
  parameters: Record<string, ParameterValue>;
  partial: boolean;
  mode: "standalone" | "inline" | "fragment";
  provenance: {
    project: string;
    artifact: string;
    version: string;
    block?: string;
  };
  highlights: Record<string, string>;
  supportControls: ControlBlock[];
}
export interface HtmlState {
  parameters: Parameters;
  tables: Record<
    string,
    {
      query: string;
      sort?: string;
      descending: boolean;
      /** Rows whose details differ from the table's initial expansion. */
      toggled?: number[];
    }
  >;
  plots: Record<string, PlotState>;
  closed: Set<string>;
}
export function htmlState(payload: HtmlPayload): HtmlState {
  return {
    parameters: createParameters(payload.document, payload.parameters),
    tables: {},
    plots: {},
    closed: new Set(),
  };
}
const tone = (value?: string) =>
  `var(--pv-${value && value !== "neutral" ? value : "muted"})`;
const display = (value: unknown) =>
  typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value ?? "");

export function renderDocument(
  payload: HtmlPayload,
  state: HtmlState,
  width: number,
  measure: Measure = (text, size) => text.length * size * 0.51,
): string {
  const document = payload.document;
  const theme = document.theme ?? "light";
  const view = resolveView(document, state.parameters, payload.supportControls);
  function blocks(values: Block[], width: number, parent: string): string {
    return `<div class="pv-column">${values.map((value, index) => block(value, width, `${parent}.${value.id ?? index}`)).join("")}</div>`;
  }
  function table(
    value: Extract<Block, { type: "table" }>,
    width: number,
    key: string,
  ): string {
    const rows = value.rows ?? [],
      state = tableState(key);
    const columns = value.columns.filter((column) => !column.detail),
      details = value.columns.filter((column) => column.detail);
    const order = rows
      .map((_, index) => index)
      .filter(
        (index) =>
          !state.query ||
          value.columns.some((column) =>
            searchText(rows[index], column)
              .toLowerCase()
              .includes(state.query.toLowerCase()),
          ),
      );
    const sorted = value.columns.find((column) => column.key === state.sort);
    if (sorted)
      order.sort((a, b) => {
        const compared = compareCells(
          sortValue(rows[a], sorted),
          sortValue(rows[b], sorted),
        );
        const nulls =
          sortValue(rows[a], sorted) === null ||
          sortValue(rows[b], sorted) === null;
        return state.descending && !nulls ? -compared : compared;
      });
    const toggled = new Set(state.toggled ?? []);
    const open = (index: number) =>
      details.length > 0 &&
      (value.expanded === true || order.length === 1) !== toggled.has(index);
    const narrow = width < 480 && columns.length > 2;
    const cell = (row: DataRow, column: TableColumn) => {
      const view = tableCell(row, column);
      if (view.status)
        return `<span class="pv-status" style="--pv-tone:${tone(view.status)}">${escapeHtml(view.text)}</span>`;
      return `${escapeHtml(view.text)}${view.note ? ` <span class="pv-note"${view.noteTone && view.noteTone !== "neutral" ? ` style="color:${tone(view.noteTone)}"` : ""}>${escapeHtml(view.note)}</span>` : ""}`;
    };
    const detail = (row: DataRow, room: number) =>
      `<dl class="pv-details">${details
        .map((column) => {
          const raw = row[column.key],
            view = tableCell(row, column);
          const body =
            typeof raw === "string" && !column.kind
              ? `<div class="pv-rich">${markdown(raw, document, payload.highlights, room)}</div>`
              : cell(row, column);
          return raw === null || raw === undefined || raw === "" || !view.text
            ? ""
            : `<div><dt>${escapeHtml(column.label)}</dt><dd>${body}</dd></div>`;
        })
        .join("")}</dl>`;
    const toggle = (index: number, label: string) =>
      `<button type="button" class="pv-expand" aria-expanded="${open(index)}" aria-label="${escapeHtml(label)}" data-expand="${escapeHtml(key)}" data-row="${index}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${open(index) ? "M3 5.5l5 5 5-5" : "M5.5 3l5 5-5 5"}"/></svg></button>`;
    const search =
      rows.length > 5 || state.query
        ? `<label class="pv-search">Search table<input type="search" aria-label="Search ${escapeHtml(value.title ?? "table")}" data-table-search="${escapeHtml(key)}" value="${escapeHtml(state.query)}"></label>`
        : "";
    const summaryColumn = value.columns.find(
      (column) => column.key === value.summary,
    );
    let summary = "";
    if (summaryColumn) {
      const counts = statusSummary(rows, summaryColumn),
        total = counts.reduce((sum, entry) => sum + entry.count, 0);
      if (total)
        summary = `<div class="pv-status-summary"><div class="pv-status-bar" role="img" aria-label="${escapeHtml(counts.map((entry) => `${entry.count} ${entry.label}`).join(", "))}">${counts.map((entry) => `<i style="flex:${entry.count};--pv-tone:${tone(entry.tone)}"></i>`).join("")}</div><ul>${counts.map((entry) => `<li style="--pv-tone:${tone(entry.tone)}"><strong>${entry.count}</strong> ${escapeHtml(entry.label)}</li>`).join("")}</ul></div>`;
    }
    const label = (row: DataRow) => tableCell(row, columns[0]).text || "row";
    let content: string;
    if (narrow)
      content = `<div class="pv-records">${order
        .map((index) => {
          const row = rows[index];
          return `<dl>${columns.map((column) => `<div><dt>${escapeHtml(column.label)}</dt><dd>${cell(row, column)}</dd></div>`).join("")}${details.length ? `<div class="pv-record-toggle">${toggle(index, `Details for ${label(row)}`)}<span>Details</span></div>` : ""}</dl>${open(index) ? detail(row, width - 24) : ""}`;
        })
        .join("")}</div>`;
    else {
      const weight = columns.reduce(
        (sum, column) => sum + (column.weight ?? 1),
        0,
      );
      const numeric = columns.map(
        (column) =>
          column.align === "right" ||
          (column.align === undefined &&
            column.kind !== "status" &&
            rows.some((row) => typeof row[column.key] === "number") &&
            rows.every(
              (row) =>
                row[column.key] == null || typeof row[column.key] === "number",
            )),
      );
      const align = (index: number) =>
        numeric[index] ? ' class="pv-numeric"' : "";
      const span = columns.length + (details.length ? 1 : 0);
      // Detail rows share their parent's stripe, so stripes follow source rows.
      const stripe = (at: number, open: boolean) => {
        const names = [at % 2 ? "pv-alt" : "", open ? "pv-open" : ""]
          .filter(Boolean)
          .join(" ");
        return names ? ` class="${names}"` : "";
      };
      content = `<table><colgroup>${details.length ? '<col style="width:36px">' : ""}${columns.map((column) => `<col style="width:${((column.weight ?? 1) / weight) * 100}%">`).join("")}</colgroup><thead><tr>${details.length ? '<th scope="col"><span class="pv-hidden">Details</span></th>' : ""}${columns.map((column, index) => `<th scope="col"${align(index)} aria-sort="${state.sort === column.key ? (state.descending ? "descending" : "ascending") : "none"}"><button type="button" data-sort="${escapeHtml(column.key)}" data-table="${escapeHtml(key)}">${escapeHtml(column.label)}${state.sort === column.key ? (state.descending ? " ↓" : " ↑") : ""}</button></th>`).join("")}</tr></thead><tbody>${order
        .map((index, at) => {
          const row = rows[index];
          return `<tr${stripe(at, open(index))}>${details.length ? `<td class="pv-expand-cell">${toggle(index, `Details for ${label(row)}`)}</td>` : ""}${columns
            .map((column, at) => `<td${align(at)}>${cell(row, column)}</td>`)
            .join(
              "",
            )}</tr>${open(index) ? `<tr class="pv-detail-row${at % 2 ? " pv-alt" : ""}"><td colspan="${span}">${detail(row, width - 48)}</td></tr>` : ""}`;
        })
        .join("")}</tbody></table>`;
    }
    const empty = order.length
      ? ""
      : `<p class="pv-muted pv-table-empty">${rows.length ? "No rows match this search." : "No rows in this view."}</p>`;
    return `${summary}${search}${content}${empty}`;
  }
  function tableState(key: string) {
    return state.tables[key] ?? { query: "", descending: false };
  }
  function block(value: Block, width: number, key: string): string {
    let content = "";
    const title =
      value.title && !["card", "details", "callout"].includes(value.type)
        ? `<h2>${escapeHtml(value.title)}</h2>`
        : "";
    switch (value.type) {
      case "text":
        content = `<p class="pv-text">${escapeHtml(value.content)}</p>`;
        break;
      case "markdown":
        content = `<div class="pv-rich">${markdown(value.content, document, payload.highlights, width)}</div>`;
        break;
      case "code":
        content = `<div class="pv-code">${value.language ? `<small>${escapeHtml(value.language.toUpperCase())}</small>` : ""}<pre><code>${payload.highlights[`${value.language ?? ""}\n${value.content}`] ?? escapeHtml(value.content)}</code></pre></div>`;
        break;
      case "metric": {
        const total = metricTotal(value),
          parts = metricComparison(value, value.value ?? null);
        const comparison = parts
          .map(
            (part) =>
              `<span${part.tone && part.tone !== "neutral" ? ` style="color:${tone(part.tone)}"` : ""}>${escapeHtml(part.text)}</span>`,
          )
          .join(" · ");
        content = `<div class="pv-panel pv-metric"><strong class="pv-muted">${escapeHtml(value.label)}</strong><div class="pv-value" style="color:${value.tone && value.tone !== "neutral" ? tone(value.tone) : "var(--pv-ink)"}">${escapeHtml(typeof value.value === "number" ? formatNumber(value.value, value) : display(value.value))}${total ? `<span class="pv-total">${escapeHtml(total)}</span>` : ""}</div><p class="pv-comparison">${comparison}</p><p class="pv-detail" style="color:${tone(value.tone)}">${escapeHtml(value.detail ?? "")}</p></div>`;
        break;
      }
      case "progress":
        content = `<label class="pv-progress"><strong>${escapeHtml(value.label)} · ${Math.round(value.value * 100)}%</strong><progress value="${value.value}" max="1" style="--pv-progress:${value.tone ? tone(value.tone) : "var(--pv-accent)"}">${Math.round(value.value * 100)}%</progress></label>${value.detail ? `<p class="pv-caption">${escapeHtml(value.detail)}</p>` : ""}`;
        break;
      case "badge":
        content = `<span class="pv-badge" style="--pv-tone:${tone(value.tone ?? "positive")}">${escapeHtml(value.label)}</span>`;
        break;
      case "callout":
        content = `<aside class="pv-panel pv-callout" style="--pv-tone:${tone(value.tone ?? "positive")}">${value.title ? `<h3>${escapeHtml(value.title)}</h3>` : ""}<div class="pv-rich">${markdown(value.content, document, payload.highlights, width - 40)}</div></aside>`;
        break;
      case "row":
      case "column": {
        const horizontal = value.type === "row" && width >= 620;
        const total = value.children.reduce(
          (sum, _, index) => sum + (value.weights?.[index] ?? 1),
          0,
        );
        content = horizontal
          ? `<div class="pv-row" style="grid-template-columns:${value.children.map((_, index) => `${value.weights?.[index] ?? 1}fr`).join(" ")}">${value.children.map((child, index) => block(child, ((width - 16 * (value.children.length - 1)) * (value.weights?.[index] ?? 1)) / total, `${key}.${child.id ?? index}`)).join("")}</div>`
          : blocks(value.children, width, key);
        break;
      }
      case "card":
        content = `<div class="pv-panel">${value.title ? `<h3>${escapeHtml(value.title)}</h3>` : ""}${blocks(value.children, Math.max(1, width - 40), key)}</div>`;
        break;
      case "details":
        content = `<details data-details="${escapeHtml(key)}"${state.closed.has(key) ? "" : " open"}><summary>${escapeHtml(value.title ?? "Details")}</summary>${blocks(value.children, width, key)}</details>`;
        break;
      case "divider":
        content = "<hr>";
        break;
      case "spacer":
        content = `<div style="height:${value.height ?? 12}px" aria-hidden="true"></div>`;
        break;
      case "timeline":
        content = `<ol class="pv-timeline">${(value.events ?? []).map((event) => `<li style="--pv-tone:${tone(event.tone ?? "positive")}">${event.label || event.meta ? `<small>${event.label ? escapeHtml(event.label) : ""}${event.meta ? `<code class="pv-meta">${escapeHtml(event.meta)}</code>` : ""}</small>` : ""}<h3>${escapeHtml(event.title)}</h3>${event.content ? `<div class="pv-rich">${markdown(event.content, document, payload.highlights, width - 32)}</div>` : ""}</li>`).join("")}</ol>`;
        break;
      case "table":
        content = table(value, width, key);
        break;
      case "control": {
        const parameter = parameterValue(state.parameters, value.id),
          selected = JSON.stringify(parameter);
        if (value.kind === "select") {
          const values = choices(document, value),
            names = labels(values);
          content = `<label class="pv-control">${escapeHtml(value.label)}<select data-control="${escapeHtml(value.id)}"><option value="${escapeHtml(JSON.stringify(ALL))}"${isAll(parameter) ? " selected" : ""}>All values</option>${values.map((item, index) => `<option value="${escapeHtml(JSON.stringify(item))}"${JSON.stringify(item) === selected ? " selected" : ""}>${escapeHtml(names[index])}</option>`).join("")}</select></label>`;
        } else if (value.kind === "search")
          content = `<label class="pv-control">${escapeHtml(value.label)}<input type="search" data-control="${escapeHtml(value.id)}" value="${escapeHtml(typeof parameter === "string" ? parameter : "")}"></label>`;
        else if (value.kind === "toggle")
          content = `<label class="pv-toggle"><input type="checkbox" data-control="${escapeHtml(value.id)}"${parameter === true ? " checked" : ""}>${escapeHtml(value.label)}</label>`;
        else {
          const bounds = numericBounds(document, value),
            range =
              typeof parameter === "object" &&
              parameter !== null &&
              !isAll(parameter)
                ? parameter
                : {};
          content = `<fieldset class="pv-range"><legend>${escapeHtml(value.label)}</legend>${(["min", "max"] as const).map((bound) => `<label>${bound === "min" ? "Minimum" : "Maximum"}<input type="number" data-control="${escapeHtml(value.id)}" data-range="${bound}" value="${escapeHtml(range[bound] ?? bounds[bound])}" min="${bounds.min}" max="${bounds.max}" step="any"></label>`).join("")}</fieldset>`;
        }
        break;
      }
      case "chart": {
        const selection = view.chartSelections.get(key);
        content = plot(
          value,
          width,
          theme,
          key,
          state.plots[key] ?? defaultPlot(),
          selection
            ? {
                ...selection,
                selected: parameterValue(state.parameters, selection.control),
              }
            : undefined,
          measure,
        );
        break;
      }
      case "histogram":
      case "boxplot":
      case "waterfall":
        content = analytical(
          value,
          width,
          theme,
          key,
          state.plots[key] ?? defaultPlot(),
          measure,
        );
        break;
      case "diagram":
        content = diagram(value, width, key, measure);
        break;
      case "comparison":
        content = comparison(
          value,
          width,
          value.select ? parameterValue(state.parameters, value.select) : ALL,
          measure,
        );
        break;
      case "heatmap": {
        const xs = value.x ?? [],
          ys = value.y ?? [],
          xLabels = labels(xs),
          yLabels = labels(ys),
          values = value.values ?? [],
          nameWidth = Math.min(180, Math.max(72, width * 0.24)),
          perBand = Math.max(1, Math.floor((width - nameWidth) / 72));
        const observed = values
            .flat()
            .filter((value): value is number => value !== null),
          min = value.min ?? Math.min(0, ...observed),
          max = value.max ?? Math.max(0, ...observed);
        const ramps =
          theme === "dark"
            ? ["#203548", "#2f7985", "#62c6ca"]
            : ["#edf5f6", "#7bbfc6", "#087f8c"];
        const format = (number: number) =>
          `${value.decimals === undefined ? number : number.toFixed(value.decimals)}${value.suffix ?? ""}`;
        if (!xs.length || !ys.length) {
          content = '<p class="pv-empty">No observations in this dataset.</p>';
          break;
        }
        content = `<div class="pv-heatmap">${value.xLabel ? `<strong class="pv-heat-axis">${escapeHtml(value.xLabel)}</strong>` : ""}`;
        for (let start = 0; start < xs.length; start += perBand)
          content += `<table><colgroup><col style="width:${nameWidth}px">${xs
            .slice(start, start + perBand)
            .map(() => "<col>")
            .join(
              "",
            )}</colgroup><thead><tr><th>${escapeHtml(value.yLabel ?? "")}</th>${xs
            .slice(start, start + perBand)
            .map((_, index) => `<th>${escapeHtml(xLabels[start + index])}</th>`)
            .join("")}</tr></thead><tbody>${ys
            .map(
              (_, yi) =>
                `<tr><th scope="row">${escapeHtml(yLabels[yi])}</th>${xs
                  .slice(start, start + perBand)
                  .map((_, xi) => {
                    const valueAt = values[yi]?.[start + xi];
                    if (valueAt === null || valueAt === undefined)
                      return '<td class="pv-missing" aria-label="No observation">Missing</td>';
                    const p =
                        min === max
                          ? 0.5
                          : Math.max(
                              0,
                              Math.min(1, (valueAt - min) / (max - min)),
                            ),
                      a = ramps[p <= 0.5 ? 0 : 1],
                      b = ramps[p <= 0.5 ? 1 : 2],
                      t = p <= 0.5 ? p * 2 : (p - 0.5) * 2;
                    const rgb = [1, 3, 5].map((index) =>
                      Math.round(
                        parseInt(a.slice(index, index + 2), 16) * (1 - t) +
                          parseInt(b.slice(index, index + 2), 16) * t,
                      ),
                    );
                    const linear = (channel: number) => {
                      const v = channel / 255;
                      return v <= 0.04045
                        ? v / 12.92
                        : ((v + 0.055) / 1.055) ** 2.4;
                    };
                    const luminance =
                      linear(rgb[0]) * 0.2126 +
                      linear(rgb[1]) * 0.7152 +
                      linear(rgb[2]) * 0.0722;
                    const ink =
                        linear(23) * 0.2126 +
                        linear(32) * 0.7152 +
                        linear(51) * 0.0722,
                      contrast =
                        (Math.max(luminance, ink) + 0.05) /
                        (Math.min(luminance, ink) + 0.05);
                    return `<td style="background:rgb(${rgb.join(",")});color:${contrast >= 1.05 / (luminance + 0.05) ? "#172033" : "#ffffff"}" data-tooltip="${escapeHtml(`${xLabels[start + xi]} · ${yLabels[yi]}: ${format(valueAt)}`)}">${escapeHtml(format(valueAt))}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join("")}</tbody></table>`;
        content += observed.length
          ? `<div class="pv-heat-scale"><i aria-hidden="true" style="width:${Math.min(160, width * 0.3)}px;background:${min === max ? ramps[1] : `linear-gradient(to right,${ramps.join(",")})`}"></i><span>${escapeHtml(min === max ? format(min) : `${format(min)} to ${format(max)}`)}</span></div>`
          : '<p class="pv-empty">No numeric observations in this view.</p>';
        content += "</div>";
        break;
      }
      case "image": {
        const source = document.assets?.[value.asset];
        if (!source) throw new Error(`Unknown image asset: ${value.asset}`);
        content = `<img class="pv-image" src="${escapeHtml(source)}" alt="${escapeHtml(value.title ?? value.caption ?? value.asset)}"${value.height === undefined ? "" : ` style="width:100%;height:${value.height}px;object-fit:${value.fit ?? "contain"}"`}>`;
        if (value.annotations?.length) {
          const percent = (fraction: number) => `${fraction * 100}%`;
          const marks = value.annotations
            .map(
              (note, index) =>
                `${note.width !== undefined && note.height !== undefined ? `<span class="pv-region" style="left:${percent(note.x)};top:${percent(note.y)};width:${percent(note.width)};height:${percent(note.height)}"></span>` : ""}<span class="pv-marker" style="left:${percent(note.x)};top:${percent(note.y)}" aria-hidden="true">${index + 1}</span>`,
            )
            .join("");
          content = `<div class="pv-annotated">${content}${marks}</div><ol class="pv-annotations">${value.annotations.map((note, index) => `<li><span class="pv-marker" aria-hidden="true">${index + 1}</span>${escapeHtml(note.label)}</li>`).join("")}</ol>`;
        }
        break;
      }
    }
    return `<section data-block="${escapeHtml(key)}"${value.type === "control" ? "" : ` aria-label="${escapeHtml(value.title ?? ("label" in value ? value.label : value.type))}"`} class="pv-block">${title}${content}${value.caption ? `<p class="pv-caption">${escapeHtml(value.caption)}</p>` : ""}</section>`;
  }
  const padding =
      payload.mode === "standalone"
        ? width < 480
          ? payload.partial
            ? 24
            : 16
          : payload.partial
            ? 48
            : 36
        : 0,
    available = Math.max(1, width - padding * 2);
  const heading = payload.partial
    ? ""
    : `<header><p class="pv-eyebrow">PROJECT VISUALIZE / ${escapeHtml((document.category ?? document.type ?? "artifact").toUpperCase())}</p><h1 style="font-size:${available < 480 ? 30 : 38}px">${escapeHtml(document.title)}</h1>${document.subtitle ? `<p class="pv-subtitle">${escapeHtml(document.subtitle)}</p>` : ""}<hr></header>`;
  return `${heading}${blocks(view.body, available, "body")}`;
}

export function themeStyle(theme: Theme): string {
  return `${Object.entries(palettes[theme])
    .map(([key, value]) => `--pv-${key}:${value}`)
    .join(";")};${chartColors(theme)
    .map((value, index) => `--pv-series-${index + 1}:${value}`)
    .join(";")}`;
}
