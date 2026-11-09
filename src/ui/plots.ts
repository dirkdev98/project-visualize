import {
  ImDrawList_AddCircleFilled,
  ImDrawList_AddLine,
  ImDrawList_AddRectFilled,
  ImPlot_BeginItem,
  ImPlot_EndItem,
  ImPlot_FitPoint,
  ImPlot_PlotBars_doublePtrdoublePtr,
  ImPlot_PlotLine_doublePtrdoublePtr,
  ImPlot_PlotScatter_doublePtrdoublePtr,
  ImPlot_PlotShaded_doublePtrdoublePtrInt,
  ImPlot_PlotToPixels_double,
  ImPlot_PopPlotClipRect,
  ImPlot_PushPlotClipRect,
  ImPlotBarsFlags_Horizontal,
  ImPlotMarker_Circle,
  ImPlotMarker_None,
  ImPlotProp_FillColor,
  ImPlotProp_Flags,
  ImPlotProp_LineColor,
  ImPlotProp_LineWeight,
  ImPlotProp_Marker,
  ImPlotProp_MarkerFillColor,
  ImPlotProp_MarkerLineColor,
  ImPlotProp_MarkerSize,
  type ImPlotSpec_c,
  ImPlotSpec_ImPlotSpec,
  ImPlotSpec_SetProp_Float,
  ImPlotSpec_SetProp_S32,
  ImPlotSpec_SetProp_Vec4,
} from "maligator:ffi/visualize";
import { plotDrawList } from "./draw-list.ts";
import type { boxplot } from "./statistics.ts";
import { type Color, currentTheme, packed } from "./theme.ts";

export class Plots {
  private styles = new Map<string, ImPlotSpec_c>();
  private theme = currentTheme();
  dispose() {
    for (const style of this.styles.values()) style[Symbol.dispose]();
    this.styles.clear();
  }
  private style(
    color: Color,
    marker: number,
    shaded: boolean,
    horizontal = false,
  ) {
    if (this.theme !== currentTheme()) {
      this.dispose();
      this.theme = currentTheme();
    }
    const key = `${color.x}:${color.y}:${color.z}:${color.w}:${marker}:${shaded}:${horizontal}`;
    let style = this.styles.get(key);
    if (style) return style;
    style = ImPlotSpec_ImPlotSpec() ?? undefined;
    if (!style) throw new Error("Cannot create a plot style");
    if (horizontal)
      ImPlotSpec_SetProp_S32(
        style,
        ImPlotProp_Flags,
        ImPlotBarsFlags_Horizontal,
      );
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
    horizontal = false,
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
      horizontal,
    );
    if (kind === "bar")
      ImPlot_PlotBars_doublePtrdoublePtr(
        label,
        horizontal ? y : x,
        horizontal ? x : y,
        barWidth,
        style,
      );
    else if (kind === "scatter")
      ImPlot_PlotScatter_doublePtrdoublePtr(label, x, y, style);
    else ImPlot_PlotLine_doublePtrdoublePtr(label, x, y, style);
  }
  box(
    label: string,
    index: number,
    summary: NonNullable<ReturnType<typeof boxplot>>,
    color: Color,
  ) {
    if (
      !ImPlot_BeginItem(
        label,
        this.style(color, ImPlotMarker_None, false),
        color,
        ImPlotMarker_None,
      )
    )
      return;
    try {
      ImPlot_FitPoint({
        x: index - 0.45,
        y: Math.min(summary.low, ...summary.outliers),
      });
      ImPlot_FitPoint({
        x: index + 0.45,
        y: Math.max(summary.high, ...summary.outliers),
      });
      const draw = plotDrawList();
      const p = (x: number, y: number) =>
        ImPlot_PlotToPixels_double(x, y, -1, -1);
      ImPlot_PushPlotClipRect(0);
      ImDrawList_AddLine(
        draw,
        p(index, summary.low),
        p(index, summary.high),
        packed(color),
        1.5,
        0,
      );
      for (const y of [summary.low, summary.high])
        ImDrawList_AddLine(
          draw,
          p(index - 0.16, y),
          p(index + 0.16, y),
          packed(color),
          1.5,
          0,
        );
      ImDrawList_AddRectFilled(
        draw,
        p(index - 0.3, summary.q3),
        p(index + 0.3, summary.q1),
        packed({ ...color, w: 0.35 }),
        2,
        0,
      );
      ImDrawList_AddLine(
        draw,
        p(index - 0.3, summary.median),
        p(index + 0.3, summary.median),
        packed(color),
        2.5,
        0,
      );
      for (const y of summary.outliers)
        ImDrawList_AddCircleFilled(draw, p(index, y), 3, packed(color), 0);
      ImPlot_PopPlotClipRect();
    } finally {
      ImPlot_EndItem();
    }
  }
  waterfall(
    label: string,
    steps: { start: number; end: number }[],
    colors: Color[],
  ) {
    const color = colors[0];
    if (
      !ImPlot_BeginItem(
        label,
        this.style(color, ImPlotMarker_None, false),
        color,
        ImPlotMarker_None,
      )
    )
      return;
    try {
      const draw = plotDrawList();
      const p = (x: number, y: number) =>
        ImPlot_PlotToPixels_double(x, y, -1, -1);
      for (const [i, step] of steps.entries()) {
        ImPlot_FitPoint({ x: i - 0.45, y: Math.min(step.start, step.end) });
        ImPlot_FitPoint({ x: i + 0.45, y: Math.max(step.start, step.end) });
      }
      ImPlot_PushPlotClipRect(0);
      for (const [i, step] of steps.entries()) {
        ImDrawList_AddRectFilled(
          draw,
          p(i - 0.34, Math.max(step.start, step.end)),
          p(i + 0.34, Math.min(step.start, step.end)),
          packed(colors[i]),
          2,
          0,
        );
        if (i < steps.length - 1)
          ImDrawList_AddLine(
            draw,
            p(i + 0.34, step.end),
            p(i + 0.66, step.end),
            packed({ ...color, w: 0.5 }),
            1,
            0,
          );
      }
      ImPlot_PopPlotClipRect();
    } finally {
      ImPlot_EndItem();
    }
  }
}
