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
  ImGuiCol_InputTextCursor,
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
  ImPlotCol_InlayText,
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
  pv_ui_style,
} from "maligator:ffi/visualize";
import type { Theme } from "../model.ts";
import { chartColors, palettes } from "../palette.ts";
import { type Font, fontFile, iconFontFile } from "./font-files.ts";

export type { Font } from "./font-files.ts";

export type Color = ImVec4_c;
export const fonts: Partial<Record<Font | "icons", ImFont>> = {};
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
  ink: color(palettes.light.ink),
  muted: color(palettes.light.muted),
  accent: color(palettes.light.accent),
  paper: color(palettes.light.paper),
  surface: color(palettes.light.surface),
  onAccent: color(palettes.light.onAccent),
  border: color(palettes.light.border),
  blue: color(palettes.light.blue),
  positive: color(palettes.light.positive),
  negative: color(palettes.light.negative),
  warning: color(palettes.light.warning),
  code: color(palettes.light.code),
};
export const seriesColors = [
  palette.accent,
  palette.blue,
  ...chartColors("light")
    .slice(2)
    .map((hex) => color(hex)),
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
    [ImGuiCol_FrameBg, shade("#eeeef2", "#2b2b31")],
    [ImGuiCol_FrameBgHovered, shade("#e8e7ef", "#34333c")],
    [ImGuiCol_FrameBgActive, shade("#dedbe9", "#3f3b4d")],
    [ImGuiCol_Header, shade("#ece9f8", "#353044")],
    [ImGuiCol_HeaderHovered, shade("#e4dff5", "#423a56")],
    [ImGuiCol_HeaderActive, shade("#d9d0f0", "#504566")],
    [ImGuiCol_Button, shade("#ece9f8", "#353044")],
    [ImGuiCol_ButtonHovered, shade("#e1d9f6", "#463b5d")],
    [ImGuiCol_ButtonActive, shade("#d3c6f0", "#574973")],
    [ImGuiCol_CheckMark, palette.accent],
    [ImGuiCol_CheckboxSelectedBg, shade("#ece9f8", "#353044")],
    [ImGuiCol_ScrollbarBg, palette.paper],
    [ImGuiCol_ScrollbarGrab, shade("#ceced7", "#484852")],
    [ImGuiCol_ScrollbarGrabHovered, shade("#b9b9c6", "#5c5c68")],
    [ImGuiCol_ScrollbarGrabActive, shade("#a2a2b3", "#71717e")],
    [ImGuiCol_SliderGrab, palette.accent],
    [ImGuiCol_SliderGrabActive, palette.blue],
    [ImGuiCol_TableHeaderBg, shade("#efeff3", "#2a2a30")],
    [ImGuiCol_TableBorderStrong, palette.border],
    [ImGuiCol_TableBorderLight, palette.border],
    [ImGuiCol_PlotHistogram, palette.accent],
    [ImGuiCol_TableRowBgAlt, shade("#fafafa", "#27272c")],
    [ImGuiCol_Separator, palette.border],
    [ImGuiCol_NavCursor, palette.accent],
    [ImGuiCol_InputTextCursor, palette.ink],
    [ImGuiCol_TextSelectedBg, shade("#c9bfee", "#69558f", 0.75)],
  ];
}
let colors = widgetColors("light");
export const framePadding = { x: 10, y: 7 };
export const itemSpacing = { x: 12, y: 12 };
const vectors: [number, { x: number; y: number }][] = [
  [ImGuiStyleVar_WindowPadding, { x: 28, y: 28 }],
  [ImGuiStyleVar_FramePadding, framePadding],
  [ImGuiStyleVar_ItemSpacing, itemSpacing],
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
  [ImPlotCol_InlayText, palette.ink],
];
const lightPalette = Object.fromEntries(
  Object.entries(palette).map(([key, value]) => [key, { ...value }]),
) as typeof palette;
const lightSeries = seriesColors.map((value) => ({ ...value }));
let activeTheme: Theme = "light";
export function currentTheme(): Theme {
  return activeTheme;
}
export function setTheme(mode: Theme) {
  for (const key of Object.keys(palette) as (keyof typeof palette)[])
    Object.assign(
      palette[key],
      mode === "light" ? lightPalette[key] : color(palettes.dark[key]),
    );
  for (let i = 2; i < seriesColors.length; i++)
    Object.assign(
      seriesColors[i],
      mode === "light" ? lightSeries[i] : color(chartColors("dark")[i]),
    );
  colors = widgetColors(mode);
  activeTheme = mode;
  pv_surface_background(palette.paper);
}
export function initializeTheme(mode: Theme = "light") {
  igStyleColorsLight();
  pv_ui_style(2);
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
  const icons = ImFontAtlas_AddFontFromFileTTF(atlas, iconFontFile(), 18);
  if (!icons) throw new Error("Cannot load the icon font");
  fonts.icons = icons;
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
