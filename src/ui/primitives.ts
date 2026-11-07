import {
  ImDrawList_AddRect,
  ImDrawList_AddRectFilled,
  type ImDrawListSplitter,
  ImDrawListSplitter_destroy,
  ImDrawListSplitter_ImDrawListSplitter,
  ImDrawListSplitter_Merge,
  ImDrawListSplitter_SetCurrentChannel,
  ImDrawListSplitter_Split,
  ImFont_GetFontBaked,
  ImGuiCol_FrameBg,
  ImGuiCol_Text,
  ImGuiStyleVar_CellPadding,
  ImGuiTableFlags_PadOuterX,
  ImGuiTableFlags_SizingStretchSame,
  igBeginTable,
  igCalcTextSize,
  igDummy,
  igEndTable,
  igGetColorU32_Col,
  igGetContentRegionAvail,
  igGetCursorPosX,
  igGetCursorScreenPos,
  igGetItemID,
  igGetItemRectMax,
  igGetItemRectMin,
  igGetWindowDrawList,
  igPopFont,
  igPopID,
  igPopStyleColor,
  igPopStyleVar,
  igPopTextWrapPos,
  igPushFont,
  igPushID_Str,
  igPushStyleColor_Vec4,
  igPushStyleVar_Vec2,
  igPushTextWrapPos,
  igSetCursorScreenPos,
  igSetNextItemAllowOverlap,
  igTableNextColumn,
  igTableNextRow,
  igTextUnformatted,
  pv_error,
  pv_input_clear,
  pv_input_text,
} from "maligator:ffi/visualize";
import { iconButton } from "./icons.ts";
import { currentCapture, keepLineTogether } from "./layout.ts";
import { selectingText, selectionBreak, selectionText } from "./selection.ts";
import { textLine } from "./text-layout.ts";
import {
  type Color,
  type Font,
  fonts,
  itemSpacing,
  packed,
  palette,
} from "./theme.ts";
import { itemTooltip } from "./tooltips.ts";

export function checked(result: number): number {
  if (result < 0) throw new Error(pv_error() ?? "Native rendering failed");
  return result;
}
export function text(
  value: string,
  size = 18,
  font: Font = "regular",
  tint: Color = palette.ink,
  wrap = 0,
) {
  const face = fonts[font];
  if (!face) throw new Error("Fonts are not initialized");
  igPushFont(face, size);
  igPushStyleColor_Vec4(ImGuiCol_Text, tint);
  const width = wrap < 0 ? 0 : Math.max(1, wrap || available());
  if (wrap >= 0) igPushTextWrapPos(wrap === 0 ? 0 : igGetCursorPosX() + wrap);
  igTextUnformatted(value);
  captureWrappedText(value, font, size, igGetItemRectMin(), width);
  selectionBreak();
  if (wrap >= 0) igPopTextWrapPos();
  igPopStyleColor(1);
  igPopFont();
}
export function captureText(
  value: string,
  font: Font,
  size: number,
  point: { x: number; y: number },
  width: number,
  link?: string,
) {
  const capture = currentCapture();
  if (!capture || !value.trim() || width <= 0) return;
  const key = `${font}:${size}`;
  let ascent = capture.metrics.get(key);
  if (ascent === undefined) {
    const face = fonts[font];
    if (!face) throw new Error("Fonts are not initialized");
    const baked = ImFont_GetFontBaked(face, size);
    if (!baked) throw new Error("Font metrics are unavailable");
    // Match ImGui's float precision to preserve selectable PDF text baselines.
    const scale = Math.fround(Math.fround(size) / baked.Size);
    ascent = Math.fround(baked.Ascent * scale);
    capture.metrics.set(key, ascent);
  }
  const x = Math.trunc(point.x),
    y = Math.trunc(point.y);
  capture.text.push({
    value: value.replace(/\r/g, ""),
    font,
    size,
    x,
    y,
    baseline: y + ascent,
    width,
    link,
  });
  keepLineTogether(y, y + size);
}
export function captureWrappedText(
  value: string,
  font: Font,
  size: number,
  point: { x: number; y: number },
  width: number,
) {
  if ((!currentCapture() && !selectingText()) || !value) return;
  const face = fonts[font];
  if (!face) throw new Error("Fonts are not initialized");
  igPushFont(face, size);
  try {
    let remaining = value,
      y = point.y;
    while (remaining.length) {
      const line = textLine(remaining, width);
      if (line.consumed <= 0)
        throw new Error("Native text measurement made no progress");
      captureText(
        remaining.slice(0, line.length),
        font,
        size,
        { x: point.x, y },
        line.width,
      );
      selectionText(
        remaining.slice(0, line.length),
        font,
        size,
        { x: point.x, y },
        line.width,
      );
      selectionBreak(remaining.slice(line.length, line.consumed));
      remaining = remaining.slice(line.consumed);
      y += size;
    }
  } finally {
    igPopFont();
  }
}
export function scalar(value: unknown): string {
  return value === null || value === undefined
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
}
export function available(): number {
  return igGetContentRegionAvail().x;
}
export function inputBuffer(value = "", capacity = 256): Int8Array {
  const bytes = Buffer.from(value);
  const result = new Int8Array(Math.max(capacity, bytes.length + 1));
  result.set(bytes);
  return result;
}
export function inputValue(buffer: Int8Array): string {
  const end = buffer.indexOf(0);
  return Buffer.from(
    buffer.buffer,
    buffer.byteOffset,
    end < 0 ? buffer.byteLength : end,
  ).toString("utf8");
}
export function input(id: string, hint: string, buffer: Int8Array): boolean {
  igSetNextItemAllowOverlap();
  const changed = pv_input_text(id, hint, buffer) !== 0;
  const value = inputValue(buffer);
  if (value) {
    const inputID = igGetItemID();
    const min = igGetItemRectMin(),
      max = igGetItemRectMax();
    if (igCalcTextSize(value, false, -1).x > max.x - min.x - 42)
      itemTooltip(value);
    overlay(() => {
      const draw = igGetWindowDrawList();
      if (draw)
        ImDrawList_AddRectFilled(
          draw,
          { x: max.x - 29, y: min.y + 2 },
          { x: max.x - 2, y: max.y - 2 },
          igGetColorU32_Col(ImGuiCol_FrameBg, 1),
          5,
          0,
        );
      igSetCursorScreenPos({
        x: max.x - 27,
        y: min.y + (max.y - min.y - 24) / 2,
      });
      igPushID_Str(id);
      if (iconButton("##clear", "close", "Clear", { size: 24, iconSize: 13 })) {
        pv_input_clear(inputID);
      }
      igPopID();
    });
  }
  return changed;
}
const splitters: ImDrawListSplitter[] = [];
let panelDepth = 0;
export function releasePanels() {
  for (const splitter of splitters) ImDrawListSplitter_destroy(splitter);
  splitters.length = 0;
}
export function panel(body: () => void, background: Color = palette.surface) {
  const draw = igGetWindowDrawList();
  if (!draw) throw new Error("Cannot access the panel canvas");
  let splitter = splitters[panelDepth];
  if (!splitter) {
    const created = ImDrawListSplitter_ImDrawListSplitter();
    if (!created) throw new Error("Cannot create a panel drawing layer");
    splitter = created;
    splitters.push(splitter);
  }
  panelDepth++;
  ImDrawListSplitter_Split(splitter, draw, 2);
  ImDrawListSplitter_SetCurrentChannel(splitter, draw, 1);
  igPushStyleVar_Vec2(ImGuiStyleVar_CellPadding, { x: 20, y: 18 });
  try {
    if (
      !igBeginTable(
        "panel",
        1,
        ImGuiTableFlags_PadOuterX | ImGuiTableFlags_SizingStretchSame,
        { x: 0, y: 0 },
        0,
      )
    )
      return;
    try {
      igTableNextRow(0, 0);
      igTableNextColumn();
      body();
    } finally {
      igEndTable();
    }
    const min = igGetItemRectMin(),
      max = igGetItemRectMax();
    ImDrawListSplitter_SetCurrentChannel(splitter, draw, 0);
    ImDrawList_AddRectFilled(draw, min, max, packed(background), 12, 0);
    ImDrawList_AddRect(draw, min, max, packed(palette.border), 12, 1, 0);
  } finally {
    igPopStyleVar(1);
    ImDrawListSplitter_Merge(splitter, draw);
    panelDepth--;
  }
}
// Draws widgets at absolute positions over the preceding item. Returning the cursor
// through a zero-size item keeps the surrounding layout identical whether or not the
// overlay drew anything; a bare cursor reset would extend the parent's bounds.
export function overlay(body: () => void) {
  const cursor = igGetCursorScreenPos();
  body();
  igSetCursorScreenPos({ x: cursor.x, y: cursor.y - itemSpacing.y });
  igDummy({ x: 0, y: 0 });
}
export { itemTooltip, tooltip } from "./tooltips.ts";
