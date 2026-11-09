import {
  ImDrawList_AddCircleFilled,
  ImDrawList_AddLine,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
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
  igCalcTextSize,
  igPopFont,
  igPushFont,
} from "maligator:ffi/visualize";
import { plotDrawList } from "./draw-list.ts";
import { captureText } from "./primitives.ts";
import {
  type boxplot,
  type WaterfallGroup,
  type waterfall,
  waterfallGroups,
} from "./statistics.ts";
import { type Color, currentTheme, fonts, packed, palette } from "./theme.ts";

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
      // A single observation has no segment to draw, so mark the point.
      kind === "scatter" || (kind !== "bar" && x.length === 1)
        ? ImPlotMarker_Circle
        : ImPlotMarker_None,
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
    layout: ReturnType<typeof waterfall>,
    colors: Record<WaterfallGroup, Color>,
  ) {
    const p = (x: number, y: number) =>
      ImPlot_PlotToPixels_double(x, y, -1, -1);
    const face = fonts.regular;
    if (!face) throw new Error("Fonts are not initialized");
    for (const group of waterfallGroups) {
      const bars = [...layout.bars.entries()].filter(
        ([, bar]) => bar.group === group.id,
      );
      if (!bars.length) continue;
      const color = colors[group.id];
      if (
        !ImPlot_BeginItem(
          group.name,
          this.style(color, ImPlotMarker_None, false),
          color,
          ImPlotMarker_None,
        )
      )
        continue;
      try {
        for (const [i] of bars) {
          ImPlot_FitPoint({ x: i - 0.45, y: layout.low });
          ImPlot_FitPoint({ x: i + 0.45, y: layout.high });
        }
        const draw = plotDrawList();
        ImPlot_PushPlotClipRect(0);
        igPushFont(face, 16);
        for (const [i, bar] of bars) {
          const top = p(i - 0.34, Math.max(bar.start, bar.end)),
            bottom = p(i + 0.34, Math.min(bar.start, bar.end));
          ImDrawList_AddRectFilled(draw, top, bottom, packed(color), 2, 0);
          const size = igCalcTextSize(bar.label, false, -1);
          const point = {
            x: (top.x + bottom.x - size.x) / 2,
            y: bar.below ? bottom.y + 4 : top.y - 4 - size.y,
          };
          ImDrawList_AddText_FontPtr(
            draw,
            face,
            16,
            point,
            packed(palette.ink),
            bar.label,
            0,
          );
          captureText(bar.label, "regular", 16, point, size.x);
        }
        igPopFont();
        ImPlot_PopPlotClipRect();
      } finally {
        ImPlot_EndItem();
      }
    }
    const draw = plotDrawList();
    ImPlot_PushPlotClipRect(0);
    for (let i = 0; i + 1 < layout.bars.length; i++) {
      const from = p(i + 0.34, layout.bars[i].end),
        to = p(i + 0.66, layout.bars[i].end);
      for (let x = from.x; x < to.x; x += 7)
        ImDrawList_AddLine(
          draw,
          { x, y: from.y },
          { x: Math.min(to.x, x + 4), y: from.y },
          packed(palette.muted),
          1,
          0,
        );
    }
    ImPlot_PopPlotClipRect();
  }
}
