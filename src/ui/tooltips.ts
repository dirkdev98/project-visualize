import {
  ImDrawList_AddRectFilled,
  ImGuiCol_Text,
  ImGuiHoveredFlags_ForTooltip,
  ImGuiStyleVar_WindowPadding,
  ImGuiStyleVar_WindowRounding,
  igBeginTooltip,
  igCalcTextSize,
  igDummy,
  igEndTooltip,
  igGetCursorPosX,
  igGetCursorScreenPos,
  igGetWindowDrawList,
  igIsItemHovered,
  igIsMouseDown_Nil,
  igPopFont,
  igPopStyleColor,
  igPopStyleVar,
  igPopTextWrapPos,
  igPushFont,
  igPushStyleColor_Vec4,
  igPushStyleVar_Float,
  igPushStyleVar_Vec2,
  igPushTextWrapPos,
  igSameLine,
  igTextUnformatted,
} from "maligator:ffi/visualize";
import { type Color, fonts, packed, palette } from "./theme.ts";

export interface Tooltip {
  title?: string;
  subtitle?: string;
  rows?: { label: string; value: string; color?: Color }[];
  shortcut?: string;
}

export function tooltip(value: string | Tooltip) {
  if (igIsMouseDown_Nil(0)) return;
  const data = typeof value === "string" ? { title: value } : value;
  igPushStyleVar_Vec2(ImGuiStyleVar_WindowPadding, { x: 12, y: 10 });
  igPushStyleVar_Float(ImGuiStyleVar_WindowRounding, 8);
  igBeginTooltip();
  const face = fonts.regular;
  if (!face) throw new Error("Fonts are not initialized");
  igPushFont(face, 14);
  igPushTextWrapPos(360);
  if (data.title) igTextUnformatted(data.title);
  if (data.subtitle) {
    igPushStyleColor_Vec4(ImGuiCol_Text, palette.muted);
    igTextUnformatted(data.subtitle);
    igPopStyleColor(1);
  }
  const labelWidth = Math.min(
    200,
    Math.max(
      0,
      ...(data.rows ?? []).map(
        (row) => igCalcTextSize(row.label, false, -1).x + (row.color ? 13 : 0),
      ),
    ),
  );
  for (const row of data.rows ?? []) {
    const left = igGetCursorPosX();
    if (row.color) {
      const draw = igGetWindowDrawList();
      const point = igGetCursorScreenPos();
      if (draw)
        ImDrawList_AddRectFilled(
          draw,
          { x: point.x, y: point.y + 4 },
          { x: point.x + 7, y: point.y + 11 },
          packed(row.color),
          2,
          0,
        );
      igDummy({ x: 7, y: 14 });
      igSameLine(0, 6);
    }
    igPushTextWrapPos(left + labelWidth);
    igTextUnformatted(row.label);
    igPopTextWrapPos();
    igSameLine(left + labelWidth + 16, 0);
    igTextUnformatted(row.value);
  }
  if (data.shortcut) {
    igPushStyleColor_Vec4(ImGuiCol_Text, palette.muted);
    igTextUnformatted(data.shortcut);
    igPopStyleColor(1);
  }
  igPopTextWrapPos();
  igPopFont();
  igEndTooltip();
  igPopStyleVar(2);
}

export function itemTooltip(value: string | Tooltip) {
  if (igIsItemHovered(ImGuiHoveredFlags_ForTooltip)) tooltip(value);
}
