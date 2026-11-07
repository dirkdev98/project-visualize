import {
  ImGuiCol_Text,
  ImGuiStyleVar_CellPadding,
  ImGuiTableBgTarget_RowBg0,
  ImGuiTableFlags_BordersOuter,
  ImGuiTableFlags_SizingStretchSame,
  igBeginTable,
  igBeginTooltip,
  igEndTable,
  igEndTooltip,
  igGetContentRegionAvail,
  igGetCursorPosX,
  igGetItemRectMin,
  igInputTextWithHint,
  igPopFont,
  igPopStyleColor,
  igPopStyleVar,
  igPopTextWrapPos,
  igPushFont,
  igPushStyleColor_Vec4,
  igPushStyleVar_Vec2,
  igPushTextWrapPos,
  igTableNextColumn,
  igTableNextRow,
  igTableSetBgColor,
  igTextUnformatted,
  pv_error,
  pv_font_metrics,
  pv_text_line,
} from "maligator:ffi/visualize";
import { currentCapture, keepTogether } from "./layout.ts";
import { type Color, type Font, fonts, packed, palette } from "./theme.ts";

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
    ascent = pv_font_metrics(face, size).x;
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
  keepTogether(y, y + size);
}
export function captureWrappedText(
  value: string,
  font: Font,
  size: number,
  point: { x: number; y: number },
  width: number,
) {
  if (!currentCapture() || !value) return;
  const face = fonts[font];
  if (!face) throw new Error("Fonts are not initialized");
  igPushFont(face, size);
  try {
    let remaining = Buffer.from(value),
      y = point.y;
    while (remaining.length) {
      const line = pv_text_line(remaining.toString("utf8"), width);
      if (line.consumed <= 0)
        throw new Error("Native text measurement made no progress");
      captureText(
        remaining.subarray(0, line.length).toString("utf8"),
        font,
        size,
        { x: point.x, y },
        line.width,
      );
      remaining = remaining.subarray(line.consumed);
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
  return igInputTextWithHint(id, hint, buffer, 0);
}
export function panel(body: () => void, background: Color = palette.white) {
  igPushStyleVar_Vec2(ImGuiStyleVar_CellPadding, { x: 20, y: 18 });
  if (
    igBeginTable(
      "panel",
      1,
      ImGuiTableFlags_BordersOuter | ImGuiTableFlags_SizingStretchSame,
      { x: 0, y: 0 },
      0,
    )
  ) {
    igTableNextRow(0, 0);
    igTableNextColumn();
    igTableSetBgColor(ImGuiTableBgTarget_RowBg0, packed(background), -1);
    body();
    igEndTable();
  }
  igPopStyleVar(1);
}
export function tooltip(value: string) {
  igBeginTooltip();
  text(value, 16, "regular", palette.ink, -1);
  igEndTooltip();
}
