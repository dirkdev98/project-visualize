import type { ParameterValue } from "../model.ts";
import {
  type ComparisonBlock,
  compareItems,
  layoutComparison,
  type Paint,
} from "../ui/comparison-layout.ts";
import type { Measure } from "./diagrams.ts";
import { escapeHtml, svg } from "./markup.ts";

function color(value: Paint): string {
  return typeof value === "object"
    ? `var(--pv-series-${(value.series % 6) + 1})`
    : `var(--pv-${value})`;
}
const opacity = (name: string, value: number | undefined) =>
  value === undefined || value === 1 ? "" : ` ${name}="${value}"`;

/** Renders a comparison from the layout the viewer draws. */
export function comparison(
  block: ComparisonBlock,
  width: number,
  selection: ParameterValue,
  measure: Measure,
): string {
  const items = compareItems(block, block.rows ?? []);
  const selected =
    selection === null || typeof selection !== "object"
      ? items.findIndex(
          (item) => JSON.stringify(item.item) === JSON.stringify(selection),
        )
      : -1;
  const layout = layoutComparison(
    block,
    items,
    selected,
    width,
    (text, size, bold) => measure(text, size, bold ? "bold" : "regular"),
  );
  let drawing = "";
  for (const shape of layout.shapes) {
    if (shape.kind === "rect")
      drawing += `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.radius ?? 0}" fill="${color(shape.fill)}"${opacity("fill-opacity", shape.alpha)}/>`;
    else if (shape.kind === "line")
      drawing += `<path d="M${shape.x1},${shape.y1}L${shape.x2},${shape.y2}" stroke="${color(shape.stroke)}" stroke-width="${shape.width}"${opacity("stroke-opacity", shape.alpha)}/>`;
    else if (shape.kind === "circle")
      drawing += `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.radius}" fill="${color(shape.fill)}"${opacity("fill-opacity", shape.alpha)}/>`;
    // SVG places text on its baseline; the layout gives the line box's top.
    else
      drawing += `<text x="${shape.x}" y="${shape.y + shape.size * 0.8}" text-anchor="${shape.anchor ?? "start"}" font-size="${shape.size}"${shape.bold ? ' font-weight="600"' : ""} fill="${color(shape.fill)}">${escapeHtml(shape.text)}</text>`;
  }
  for (const hit of layout.hits) {
    const item = items[hit.index];
    const label = hit.tooltip.join("\n");
    drawing += `<rect class="pv-hit" x="${hit.x}" y="${hit.y + 1}" width="${hit.width}" height="${hit.height - 2}" rx="6" data-tooltip="${escapeHtml(label)}"${block.select ? ` role="button" tabindex="0" aria-label="${escapeHtml(hit.tooltip[0])}" aria-pressed="${hit.index === selected}" data-choose="${escapeHtml(block.select)}" data-value="${escapeHtml(JSON.stringify(item.item))}"` : ""}/>`;
  }
  return `<div class="pv-comparison">${svg(width, layout.height, block.title ?? "Comparison", drawing)}</div>`;
}
