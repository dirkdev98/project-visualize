import {
  ImPlot_PlotBars_doublePtrdoublePtr,
  ImPlot_PlotLine_doublePtrdoublePtr,
  ImPlot_PlotScatter_doublePtrdoublePtr,
  ImPlot_PlotShaded_doublePtrdoublePtrInt,
  ImPlotMarker_Circle,
  ImPlotMarker_None,
  ImPlotProp_FillColor,
  ImPlotProp_LineColor,
  ImPlotProp_LineWeight,
  ImPlotProp_Marker,
  ImPlotProp_MarkerFillColor,
  ImPlotProp_MarkerLineColor,
  ImPlotProp_MarkerSize,
  type ImPlotSpec_c,
  ImPlotSpec_SetProp_Float,
  ImPlotSpec_SetProp_S32,
  ImPlotSpec_SetProp_Vec4,
  pv_plot_spec,
} from "maligator:ffi/visualize";
import { type Color, currentTheme } from "./theme.ts";

export class Plots {
  private styles = new Map<string, ImPlotSpec_c>();
  private theme = currentTheme();
  dispose() {
    for (const style of this.styles.values()) style[Symbol.dispose]();
    this.styles.clear();
  }
  private style(color: Color, marker: number, shaded: boolean) {
    if (this.theme !== currentTheme()) {
      this.dispose();
      this.theme = currentTheme();
    }
    const key = `${color.x}:${color.y}:${color.z}:${color.w}:${marker}:${shaded}`;
    let style = this.styles.get(key);
    if (style) return style;
    style = pv_plot_spec();
    ImPlotSpec_SetProp_Vec4(style, ImPlotProp_FillColor, color);
    if (!shaded) {
      ImPlotSpec_SetProp_Vec4(style, ImPlotProp_LineColor, color);
      ImPlotSpec_SetProp_Vec4(style, ImPlotProp_MarkerLineColor, color);
      ImPlotSpec_SetProp_Vec4(style, ImPlotProp_MarkerFillColor, color);
      ImPlotSpec_SetProp_Float(style, ImPlotProp_LineWeight, 2.5);
      ImPlotSpec_SetProp_Float(style, ImPlotProp_MarkerSize, 4);
      ImPlotSpec_SetProp_S32(style, ImPlotProp_Marker, marker);
    }
    this.styles.set(key, style);
    return style;
  }
  draw(
    label: string,
    x: Float64Array,
    y: Float64Array,
    kind: "line" | "area" | "bar" | "scatter",
    color: Color,
    barWidth = 0.8,
  ) {
    if (kind === "area") {
      const fill = { ...color, w: currentTheme() === "dark" ? 0.22 : 0.13 };
      ImPlot_PlotShaded_doublePtrdoublePtrInt(
        label,
        x,
        y,
        0,
        this.style(fill, ImPlotMarker_None, true),
      );
    }
    const style = this.style(
      color,
      kind === "scatter" ? ImPlotMarker_Circle : ImPlotMarker_None,
      false,
    );
    if (kind === "bar")
      ImPlot_PlotBars_doublePtrdoublePtr(label, x, y, barWidth, style);
    else if (kind === "scatter")
      ImPlot_PlotScatter_doublePtrdoublePtr(label, x, y, style);
    else ImPlot_PlotLine_doublePtrdoublePtr(label, x, y, style);
  }
}
