import {
  type ImFont,
  ImFontAtlas_AddFontFromFileTTF,
  ImGuiCol_Border,
  ImGuiCol_Button,
  ImGuiCol_ButtonActive,
  ImGuiCol_ButtonHovered,
  ImGuiCol_CheckboxSelectedBg,
  ImGuiCol_CheckMark,
  ImGuiCol_ChildBg,
  ImGuiCol_FrameBg,
  ImGuiCol_FrameBgActive,
  ImGuiCol_FrameBgHovered,
  ImGuiCol_Header,
  ImGuiCol_HeaderActive,
  ImGuiCol_HeaderHovered,
  ImGuiCol_NavCursor,
  ImGuiCol_PlotHistogram,
  ImGuiCol_PopupBg,
  ImGuiCol_ScrollbarBg,
  ImGuiCol_ScrollbarGrab,
  ImGuiCol_ScrollbarGrabActive,
  ImGuiCol_ScrollbarGrabHovered,
  ImGuiCol_Separator,
  ImGuiCol_SliderGrab,
  ImGuiCol_SliderGrabActive,
  ImGuiCol_TableBorderLight,
  ImGuiCol_TableBorderStrong,
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
  ImPlot_PopStyleVar,
  ImPlot_PushStyleColor_Vec4,
  ImPlot_PushStyleVar_Vec2,
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
  ImPlotStyleVar_FitPadding,
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
import type { Theme } from "../model.ts";
import { type Font, fontFile } from "./font-files.ts";

export type { Font } from "./font-files.ts";

export type Color = ImVec4_c;
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
  surface: color("#ffffff"),
  onAccent: color("#ffffff"),
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
function widgetColors(mode: Theme): [number, Color][] {
  const shade = (light: string, dark: string, alpha = 1) =>
    color(mode === "dark" ? dark : light, alpha);
  return [
    [ImGuiCol_Text, palette.ink],
    [ImGuiCol_TextDisabled, palette.muted],
    [ImGuiCol_WindowBg, palette.paper],
    [ImGuiCol_ChildBg, palette.paper],
    [ImGuiCol_PopupBg, palette.surface],
    [ImGuiCol_Border, palette.border],
    [ImGuiCol_FrameBg, shade("#eaf0f6", "#233347")],
    [ImGuiCol_FrameBgHovered, shade("#e2ebf3", "#2c4158")],
    [ImGuiCol_FrameBgActive, shade("#d7e5f0", "#314c64")],
    [ImGuiCol_Header, shade("#e2eef2", "#23434e")],
    [ImGuiCol_HeaderHovered, shade("#d7e8ee", "#2e4f5a")],
    [ImGuiCol_HeaderActive, shade("#c7e0e7", "#365d67")],
    [ImGuiCol_Button, shade("#e2eef2", "#23434e")],
    [ImGuiCol_ButtonHovered, shade("#d1e7ec", "#2c5360")],
    [ImGuiCol_ButtonActive, shade("#badbe3", "#356474")],
    [ImGuiCol_CheckMark, palette.accent],
    [ImGuiCol_CheckboxSelectedBg, shade("#e2eef2", "#23434e")],
    [ImGuiCol_ScrollbarBg, palette.paper],
    [ImGuiCol_ScrollbarGrab, shade("#c6d1dd", "#40536b")],
    [ImGuiCol_ScrollbarGrabHovered, shade("#adbdce", "#526b87")],
    [ImGuiCol_ScrollbarGrabActive, shade("#91a8bf", "#637f9f")],
    [ImGuiCol_SliderGrab, palette.accent],
    [ImGuiCol_SliderGrabActive, palette.blue],
    [ImGuiCol_TableHeaderBg, shade("#edf2f7", "#223348")],
    [ImGuiCol_TableBorderStrong, palette.border],
    [ImGuiCol_TableBorderLight, palette.border],
    [ImGuiCol_PlotHistogram, palette.accent],
    [ImGuiCol_TableRowBgAlt, shade("#f7f9fc", "#1e2d40")],
    [ImGuiCol_Separator, palette.border],
    [ImGuiCol_NavCursor, palette.accent],
    [ImGuiCol_TextSelectedBg, shade("#b8dce6", "#31677a", 0.75)],
  ];
}
let colors = widgetColors("light");
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
  [ImPlotCol_FrameBg, palette.surface],
  [ImPlotCol_PlotBg, palette.surface],
  [ImPlotCol_PlotBorder, palette.border],
  [ImPlotCol_LegendBg, palette.surface],
  [ImPlotCol_LegendBorder, palette.border],
  [ImPlotCol_LegendText, palette.ink],
  [ImPlotCol_AxisText, palette.muted],
  [ImPlotCol_AxisGrid, palette.border],
  [ImPlotCol_AxisTick, palette.border],
];
const lightPalette = Object.fromEntries(
  Object.entries(palette).map(([key, value]) => [key, { ...value }]),
) as typeof palette;
const lightSeries = seriesColors.map((value) => ({ ...value }));
const darkPalette: Record<keyof typeof palette, string> = {
  ink: "#e8eef6",
  muted: "#9aacc2",
  accent: "#55c8c0",
  paper: "#111a25",
  surface: "#1b2838",
  onAccent: "#102d34",
  border: "#304156",
  blue: "#7caeff",
  positive: "#55c8c0",
  negative: "#f28b91",
  warning: "#e8b56a",
  code: "#172331",
};
let activeTheme: Theme = "light";
export function currentTheme(): Theme {
  return activeTheme;
}
export function setTheme(mode: Theme) {
  for (const key of Object.keys(palette) as (keyof typeof palette)[])
    Object.assign(
      palette[key],
      mode === "light" ? lightPalette[key] : color(darkPalette[key]),
    );
  for (let i = 2; i < seriesColors.length; i++)
    Object.assign(
      seriesColors[i],
      mode === "light"
        ? lightSeries[i]
        : color(["#f0aa78", "#b49bf2", "#ee91b3", "#a8c977"][i - 2]),
    );
  colors = widgetColors(mode);
  activeTheme = mode;
  pv_surface_background(palette.paper);
}
export function initializeTheme(mode: Theme = "light") {
  igStyleColorsLight();
  ImPlot_StyleColorsLight();
  setTheme(mode);
  const atlas = pv_font_atlas();
  if (!atlas) throw new Error("Cannot access the font atlas");
  for (const name of ["regular", "bold", "italic", "mono"] as Font[]) {
    const file = fontFile(name);
    const font = ImFontAtlas_AddFontFromFileTTF(atlas, file, 18);
    if (!font) throw new Error(`Cannot load font: ${file}`);
    fonts[name] = font;
  }
}
export function pushTheme() {
  for (const [index, value] of colors) igPushStyleColor_Vec4(index, value);
  for (const [index, value] of vectors) igPushStyleVar_Vec2(index, value);
  for (const [index, value] of scalars) igPushStyleVar_Float(index, value);
  for (const [index, value] of plotColors)
    ImPlot_PushStyleColor_Vec4(index, value);
  ImPlot_PushStyleVar_Vec2(ImPlotStyleVar_FitPadding, { x: 0.06, y: 0.1 });
}
export function popTheme() {
  ImPlot_PopStyleVar(1);
  ImPlot_PopStyleColor(plotColors.length);
  igPopStyleVar(vectors.length + scalars.length);
  igPopStyleColor(colors.length);
}
