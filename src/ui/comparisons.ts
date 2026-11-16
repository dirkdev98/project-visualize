import {
  ImDrawList_AddCircleFilled,
  ImDrawList_AddLine,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
  ImGuiMouseCursor_Hand,
  igCalcTextSize,
  igDummy,
  igGetCursorScreenPos,
  igInvisibleButton,
  igIsItemHovered,
  igPopFont,
  igPopID,
  igPushFont,
  igPushID_Int,
  igSetCursorScreenPos,
  igSetMouseCursor,
} from "maligator:ffi/visualize";
import type { Cell, ParameterValue } from "../model.ts";
import {
  type ComparisonBlock,
  type ComparisonItem,
  compareItems,
  layoutComparison,
  type Paint,
} from "./comparison-layout.ts";
import { windowDrawList } from "./draw-list.ts";
import { keepTogether } from "./layout.ts";
import { available, captureText, tooltip } from "./primitives.ts";
import { type Color, fonts, packed, palette, seriesColors } from "./theme.ts";

function paint(value: Paint, alpha = 1): number {
  const base: Color =
    typeof value === "object"
      ? seriesColors[value.series % seriesColors.length]
      : palette[value];
  return packed({ ...base, w: base.w * alpha });
}

/** Draws comparisons from the shared layout and turns row clicks into selections. */
export class Comparisons {
  private items = new Map<ComparisonBlock, ComparisonItem[]>();
  private layouts = new Map<
    ComparisonBlock,
    {
      width: number;
      selected: number;
      layout: ReturnType<typeof layoutComparison>;
    }
  >();
  clear() {
    this.items.clear();
    this.layouts.clear();
  }
  draw(
    block: ComparisonBlock,
    selection: ParameterValue,
    exporting: boolean,
    choose: (item: Cell) => void,
  ) {
    let items = this.items.get(block);
    if (!items) {
      items = compareItems(block, block.rows ?? []);
      this.items.set(block, items);
    }
    const selected =
      selection === null || typeof selection !== "object"
        ? items.findIndex(
            (item) => JSON.stringify(item.item) === JSON.stringify(selection),
          )
        : -1;
    const width = available();
    let cached = this.layouts.get(block);
    if (!cached || cached.width !== width || cached.selected !== selected) {
      cached = {
        width,
        selected,
        layout: layoutComparison(block, items, selected, width, measure),
      };
      this.layouts.set(block, cached);
    }
    const { layout } = cached;
    const origin = igGetCursorScreenPos(),
      draw = windowDrawList();
    for (const shape of layout.shapes) {
      if (shape.kind === "rect")
        ImDrawList_AddRectFilled(
          draw,
          { x: origin.x + shape.x, y: origin.y + shape.y },
          {
            x: origin.x + shape.x + shape.width,
            y: origin.y + shape.y + shape.height,
          },
          paint(shape.fill, shape.alpha),
          shape.radius ?? 0,
          0,
        );
      else if (shape.kind === "line")
        ImDrawList_AddLine(
          draw,
          { x: origin.x + shape.x1, y: origin.y + shape.y1 },
          { x: origin.x + shape.x2, y: origin.y + shape.y2 },
          paint(shape.stroke, shape.alpha),
          shape.width,
          0,
        );
      else if (shape.kind === "circle")
        ImDrawList_AddCircleFilled(
          draw,
          { x: origin.x + shape.x, y: origin.y + shape.y },
          shape.radius,
          paint(shape.fill, shape.alpha),
          0,
        );
      else {
        const face = shape.bold ? fonts.bold : fonts.regular;
        if (!face) throw new Error("Fonts are not initialized");
        const textWidth = measure(shape.text, shape.size, shape.bold);
        const x =
          origin.x +
          shape.x -
          (shape.anchor === "end"
            ? textWidth
            : shape.anchor === "middle"
              ? textWidth / 2
              : 0);
        const point = { x, y: origin.y + shape.y };
        ImDrawList_AddText_FontPtr(
          draw,
          face,
          shape.size,
          point,
          paint(shape.fill),
          shape.text,
          0,
        );
        captureText(
          shape.text,
          shape.bold ? "bold" : "regular",
          shape.size,
          point,
          textWidth,
        );
      }
    }
    for (const hit of layout.hits) {
      const top = origin.y + hit.y;
      keepTogether(top, top + hit.height);
      if (exporting) continue;
      igSetCursorScreenPos({ x: origin.x + hit.x, y: top });
      igPushID_Int(hit.index);
      const pressed = igInvisibleButton(
        "##item",
        { x: Math.max(1, hit.width), y: Math.max(1, hit.height) },
        0,
      );
      igPopID();
      if (igIsItemHovered(0)) {
        ImDrawList_AddRectFilled(
          draw,
          { x: origin.x + hit.x, y: top + 1 },
          { x: origin.x + hit.x + hit.width, y: top + hit.height - 1 },
          packed({ ...palette.ink, w: 0.05 }),
          6,
          0,
        );
        if (block.select) igSetMouseCursor(ImGuiMouseCursor_Hand);
        tooltip({
          title: hit.tooltip[0],
          detail: hit.tooltip.slice(1).join("\n"),
          shortcut: block.select
            ? hit.index === selected
              ? "Click to clear the selection"
              : "Click to select"
            : undefined,
        });
      }
      if (pressed && block.select) choose(items[hit.index].item);
    }
    const detail = layout.hits.at(-1);
    if (detail && selected >= 0)
      keepTogether(
        origin.y + detail.y + detail.height,
        origin.y + layout.height,
      );
    igSetCursorScreenPos(origin);
    igDummy({ x: width, y: layout.height });
  }
}

function measure(text: string, size: number, bold = false): number {
  const face = bold ? fonts.bold : fonts.regular;
  if (!face) throw new Error("Fonts are not initialized");
  igPushFont(face, size);
  const width = igCalcTextSize(text, false, -1).x;
  igPopFont();
  return width;
}
