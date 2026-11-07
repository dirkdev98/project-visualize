import {
  type ImFont,
  ImFontAtlas_AddFontFromFileTTF,
  ImGuiCol_Border,
  ImGuiCol_Button,
  ImGuiCol_ButtonActive,
  ImGuiCol_ButtonHovered,
  ImGuiCol_CheckMark,
  ImGuiCol_ChildBg,
  ImGuiCol_FrameBg,
  ImGuiCol_FrameBgActive,
  ImGuiCol_FrameBgHovered,
  ImGuiCol_Header,
  ImGuiCol_HeaderActive,
  ImGuiCol_HeaderHovered,
  ImGuiCol_NavCursor,
  ImGuiCol_PopupBg,
  ImGuiCol_Separator,
  ImGuiCol_SliderGrab,
  ImGuiCol_SliderGrabActive,
  ImGuiCol_TableHeaderBg,
  ImGuiCol_TableRowBgAlt,
  ImGuiCol_Text,
  ImGuiCol_TextDisabled,
  ImGuiCol_TextSelectedBg,
  ImGuiCol_WindowBg,
  ImGuiStyleVar_CellPadding,
  ImGuiStyleVar_ChildRounding,
  ImGuiStyleVar_FramePadding,
  ImGuiStyleVar_FrameRounding,
  ImGuiStyleVar_GrabRounding,
  ImGuiStyleVar_ItemSpacing,
  ImGuiStyleVar_ScrollbarRounding,
  ImGuiStyleVar_WindowBorderSize,
  ImGuiStyleVar_WindowPadding,
  ImPlot_PopStyleColor,
  ImPlot_PushStyleColor_Vec4,
  ImPlot_StyleColorsLight,
  ImPlotCol_AxisGrid,
  ImPlotCol_AxisText,
  ImPlotCol_AxisTick,
  ImPlotCol_FrameBg,
  ImPlotCol_LegendBg,
  ImPlotCol_LegendBorder,
  ImPlotCol_LegendText,
  ImPlotCol_PlotBg,
  ImPlotCol_PlotBorder,
  type ImVec4_c,
  igPopStyleColor,
  igPopStyleVar,
  igPushStyleColor_Vec4,
  igPushStyleVar_Float,
  igPushStyleVar_Vec2,
  igStyleColorsLight,
  pv_font_atlas,
  pv_surface_background,
} from "maligator:ffi/visualize";

export type Color = ImVec4_c;
export type Font = "regular" | "bold" | "italic" | "mono";
export const fonts: Partial<Record<Font, ImFont>> = {};
export function color(hex: string, alpha = 1): Color {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return {
    x: ((value >> 16) & 255) / 255,
    y: ((value >> 8) & 255) / 255,
    z: (value & 255) / 255,
    w: alpha,
  };
}
export function packed(c: Color): number {
  return (
    (Math.round(c.x * 255) |
      (Math.round(c.y * 255) << 8) |
      (Math.round(c.z * 255) << 16) |
      (Math.round(c.w * 255) << 24)) >>>
    0
  );
}
export const palette = {
  ink: color("#172033"),
  muted: color("#687386"),
  accent: color("#087f8c"),
  paper: color("#f5f7fa"),
  white: color("#ffffff"),
  border: color("#dfe6ee"),
  blue: color("#3b82f6"),
  positive: color("#087f8c"),
  negative: color("#c3444d"),
  warning: color("#b77419"),
  code: color("#eef2f7"),
};
export const seriesColors = [
  palette.accent,
  palette.blue,
  color("#ec9258"),
  color("#866bd8"),
  color("#cf658d"),
  color("#77983e"),
];
const colors: [number, Color][] = [
  [ImGuiCol_Text, palette.ink],
  [ImGuiCol_TextDisabled, palette.muted],
  [ImGuiCol_WindowBg, palette.paper],
  [ImGuiCol_ChildBg, palette.paper],
  [ImGuiCol_PopupBg, palette.white],
  [ImGuiCol_Border, palette.border],
  [ImGuiCol_FrameBg, color("#eaf0f6")],
  [ImGuiCol_FrameBgHovered, color("#e2ebf3")],
  [ImGuiCol_FrameBgActive, color("#d7e5f0")],
  [ImGuiCol_Header, color("#e2eef2")],
  [ImGuiCol_HeaderHovered, color("#d7e8ee")],
  [ImGuiCol_HeaderActive, color("#c7e0e7")],
  [ImGuiCol_Button, color("#e2eef2")],
  [ImGuiCol_ButtonHovered, color("#d1e7ec")],
  [ImGuiCol_ButtonActive, color("#badbe3")],
  [ImGuiCol_CheckMark, palette.accent],
  [ImGuiCol_SliderGrab, palette.accent],
  [ImGuiCol_SliderGrabActive, palette.blue],
  [ImGuiCol_TableHeaderBg, color("#edf2f7")],
  [ImGuiCol_TableRowBgAlt, color("#f7f9fc")],
  [ImGuiCol_Separator, palette.border],
  [ImGuiCol_NavCursor, palette.accent],
  [ImGuiCol_TextSelectedBg, color("#b8dce6", 0.75)],
];
const vectors: [number, { x: number; y: number }][] = [
  [ImGuiStyleVar_WindowPadding, { x: 28, y: 28 }],
  [ImGuiStyleVar_FramePadding, { x: 10, y: 7 }],
  [ImGuiStyleVar_ItemSpacing, { x: 12, y: 12 }],
  [ImGuiStyleVar_CellPadding, { x: 12, y: 10 }],
];
const scalars: [number, number][] = [
  [ImGuiStyleVar_WindowBorderSize, 0],
  [ImGuiStyleVar_FrameRounding, 7],
  [ImGuiStyleVar_GrabRounding, 6],
  [ImGuiStyleVar_ScrollbarRounding, 7],
  [ImGuiStyleVar_ChildRounding, 10],
];
const plotColors: [number, Color][] = [
  [ImPlotCol_FrameBg, palette.white],
  [ImPlotCol_PlotBg, palette.white],
  [ImPlotCol_PlotBorder, palette.border],
  [ImPlotCol_LegendBg, palette.white],
  [ImPlotCol_LegendBorder, palette.border],
  [ImPlotCol_LegendText, palette.ink],
  [ImPlotCol_AxisText, palette.muted],
  [ImPlotCol_AxisGrid, palette.border],
  [ImPlotCol_AxisTick, palette.border],
];
export function initializeTheme() {
  igStyleColorsLight();
  ImPlot_StyleColorsLight();
  pv_surface_background(palette.paper);
  const atlas = pv_font_atlas();
  if (!atlas) throw new Error("Cannot access the font atlas");
  const files: Record<Font, string> = {
    regular: "/System/Library/Fonts/Supplemental/Arial.ttf",
    bold: "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    italic: "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
    mono: "/System/Library/Fonts/Menlo.ttc",
  };
  for (const name of Object.keys(files) as Font[]) {
    const font = ImFontAtlas_AddFontFromFileTTF(atlas, files[name], 18);
    if (!font) throw new Error(`Cannot load system font: ${files[name]}`);
    fonts[name] = font;
  }
}
export function pushTheme() {
  for (const [index, value] of colors) igPushStyleColor_Vec4(index, value);
  for (const [index, value] of vectors) igPushStyleVar_Vec2(index, value);
  for (const [index, value] of scalars) igPushStyleVar_Float(index, value);
  for (const [index, value] of plotColors)
    ImPlot_PushStyleColor_Vec4(index, value);
}
export function popTheme() {
  ImPlot_PopStyleColor(plotColors.length);
  igPopStyleVar(vectors.length + scalars.length);
  igPopStyleColor(colors.length);
}
