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
} from "maligator:ffi/visualize";
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
  if (wrap >= 0) igPushTextWrapPos(wrap === 0 ? 0 : igGetCursorPosX() + wrap);
  igTextUnformatted(value);
  if (wrap >= 0) igPopTextWrapPos();
  igPopStyleColor(1);
  igPopFont();
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
