import {
  ImAxis_Y1,
  ImDrawList_AddCircleFilled,
  ImDrawList_AddLine,
  ImDrawList_AddRect,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
  ImDrawList_AddTriangleFilled,
  ImGuiCol_PlotHistogram,
  ImGuiHoveredFlags_AllowWhenBlockedByActiveItem,
  ImGuiMod_Shift,
  ImGuiStyleVar_CellPadding,
  ImGuiTableBgTarget_CellBg,
  ImGuiTableColumnFlags_WidthFixed,
  ImGuiTableColumnFlags_WidthStretch,
  ImGuiTableFlags_BordersInnerH,
  ImGuiTableFlags_RowBg,
  ImGuiTableFlags_SizingStretchSame,
  ImGuiTableFlags_Sortable,
  ImGuiTableFlags_SortMulti,
  ImGuiTableRowFlags_Headers,
  ImGuiTreeNodeFlags_DefaultOpen,
  ImPlot_BeginPlot,
  ImPlot_EndPlot,
  ImPlot_GetPlotDrawList,
  ImPlot_GetPlotMousePos,
  ImPlot_GetPlotPos,
  ImPlot_GetPlotSize,
  ImPlot_IsItemHidden,
  ImPlot_IsPlotHovered,
  ImPlot_PixelsToPlot_Vec2,
  ImPlot_PlotToPixels_double,
  ImPlot_PopPlotClipRect,
  ImPlot_PushPlotClipRect,
  ImPlot_SetNextAxesToFit,
  ImPlot_SetupAxes,
  ImPlot_SetupLegend,
  ImPlotAxisFlags_Invert,
  ImPlotFlags_Crosshairs,
  ImPlotFlags_NoInputs,
  ImPlotFlags_NoMenus,
  ImPlotFlags_NoMouseText,
  ImPlotFlags_NoTitle,
  ImPlotLegendFlags_Horizontal,
  ImPlotLegendFlags_NoMenus,
  ImPlotLegendFlags_Outside,
  ImPlotLocation_East,
  ImPlotLocation_NorthWest,
  ImPlotLocation_South,
  igBeginCombo,
  igBeginDisabled,
  igBeginTable,
  igCalcTextSize,
  igCheckbox,
  igCollapsingHeader_TreeNodeFlags,
  igDummy,
  igEndCombo,
  igEndDisabled,
  igEndTable,
  igGetCursorScreenPos,
  igGetItemRectMax,
  igGetItemRectMin,
  igGetMouseDragDelta,
  igGetMousePos,
  igGetWindowDrawList,
  igIndent,
  igInvisibleButton,
  igIsItemHovered,
  igIsKeyDown_Nil,
  igIsMouseClicked_Bool,
  igIsMouseDown_Nil,
  igIsMouseDragPastThreshold,
  igIsMouseHoveringRect,
  igIsMouseReleased_Nil,
  igIsWindowHovered,
  igPopFont,
  igPopID,
  igPopStyleColor,
  igPopStyleVar,
  igProgressBar,
  igPushFont,
  igPushID_Int,
  igPushID_Str,
  igPushStyleColor_Vec4,
  igPushStyleVar_Vec2,
  igSelectable_Bool,
  igSeparator,
  igSetCursorScreenPos,
  igSetNextItemWidth,
  igSmallButton,
  igSpacing,
  igTableHeadersRow,
  igTableNextColumn,
  igTableNextRow,
  igTableSetBgColor,
  igTableSetupColumn,
  igUnindent,
  type PVImage,
  pv_image_destroy,
  pv_image_draw,
  pv_image_load,
  pv_image_size,
  pv_plot_tick,
  pv_slider_double,
  pv_table_sort,
} from "maligator:ffi/visualize";
import {
  ALL,
  dataCell as cell,
  choices,
  controls,
  createParameters,
  isAll,
  labels,
  numericBounds,
  type Parameters,
  parameterValue,
  type ResolvedView,
  resolveView,
} from "../data.ts";
import type {
  Artifact,
  Block,
  Cell,
  ControlBlock,
  ImageFit,
  ParameterValue,
  Tone,
} from "../model.ts";
import { barAt, type PlotSeries } from "./chart-hit.ts";
import { crowdedCategories } from "./chart-layout.ts";
import { layoutImage } from "./image-layout.ts";
import {
  captureHeading,
  captureTable,
  currentCapture,
  keepTogether,
} from "./layout.ts";
import { formatNumber } from "./number-format.ts";
import { Plots } from "./plots.ts";
import {
  available,
  captureWrappedText,
  input,
  inputBuffer,
  inputValue,
  panel,
  scalar,
  text,
  tooltip,
} from "./primitives.ts";
import { RichText } from "./richtext.ts";
import { TextSelection, withTextSelection } from "./selection.ts";
import { textLine } from "./text-layout.ts";
import {
  type Color,
  color,
  currentTheme,
  fonts,
  packed,
  palette,
  seriesColors,
} from "./theme.ts";

export interface DocumentState {
  tables: Record<string, { query: string }>;
  parameters: Parameters;
  revision: number;
  chartFits: Map<string, string>;
}
export function documentState(
  document: Artifact,
  overrides?: unknown,
): DocumentState {
  return {
    tables: {},
    parameters: createParameters(document, overrides),
    revision: 0,
    chartFits: new Map(),
  };
}
function tone(value: Tone | undefined): Color {
  return value && value !== "neutral" ? palette[value] : palette.muted;
}
type TableBlock = Extract<Block, { type: "table" }>;
type ChartBlock = Extract<Block, { type: "chart" }>;
type DiagramBlock = Extract<Block, { type: "diagram" }>;

const heatRamps = {
  light: [color("#edf5f6"), color("#7bbfc6"), color("#087f8c")],
  dark: [color("#203548"), color("#2f7985"), color("#62c6ca")],
};
const heatInk = color("#172033"),
  heatWhite = color("#ffffff");
function heatColor(value: number, min: number, max: number): Color {
  const position =
    min === max ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const stops = heatRamps[currentTheme()];
  const a = stops[position <= 0.5 ? 0 : 1],
    b = stops[position <= 0.5 ? 1 : 2];
  const t = position <= 0.5 ? position * 2 : (position - 0.5) * 2;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    w: 1,
  };
}
function heatText(fill: Color): Color {
  function luminance(c: Color) {
    const linear = (v: number) =>
      v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    return linear(c.x) * 0.2126 + linear(c.y) * 0.7152 + linear(c.z) * 0.0722;
  }
  const background = luminance(fill),
    dark = luminance(heatInk);
  const contrast =
    (Math.max(background, dark) + 0.05) / (Math.min(background, dark) + 0.05);
  return contrast >= 1.05 / (background + 0.05) ? heatInk : heatWhite;
}
export class DocumentRenderer {
  readonly document: Artifact;
  readonly state: DocumentState;
  private images = new Map<string, PVImage>();
  private searches = new Map<string, Int8Array>();
  private tableCells = new Map<
    TableBlock,
    { values: string[][]; right: boolean[] }
  >();
  private cellWidths = new Map<string, number>();
  private orders = new Map<string, { key: string; indices: number[] }>();
  private plots = new Map<ChartBlock, PlotSeries[]>();
  private plotDrawing = new Plots();
  private categoryLayouts = new Map<
    ChartBlock,
    {
      width: number;
      horizontal: boolean;
      height: number;
      labels: string[];
      stride: number;
    }
  >();
  private barPress: { key: string; revision: number; value: Cell } | undefined;
  private rich: RichText;
  private selection = new TextSelection();
  private view: ResolvedView | undefined;
  private viewRevision = -1;
  private controlChoices = new Map<
    string,
    { values: Cell[]; labels: string[] }
  >();
  private controlInputs = new Map<string, Int8Array>();
  constructor(
    document: Artifact,
    state: DocumentState = documentState(document),
  ) {
    this.document = document;
    this.state = state;
    this.rich = new RichText((asset, width) => this.image(asset, width));
  }
  dispose() {
    for (const image of this.images.values()) pv_image_destroy(image);
    this.images.clear();
    this.plots.clear();
    this.plotDrawing.dispose();
    this.categoryLayouts.clear();
    this.orders.clear();
    this.searches.clear();
    this.tableCells.clear();
    this.cellWidths.clear();
    this.rich.dispose();
  }
  private image(
    asset: string,
    width = available(),
    frameHeight?: number,
    fit?: ImageFit,
  ): number {
    const file = this.document.assets?.[asset];
    if (!file) throw new Error(`Unknown image asset: ${asset}`);
    let image = this.images.get(file);
    if (!image) {
      image = pv_image_load(file) ?? undefined;
      if (!image) throw new Error(`Cannot load image asset: ${asset}`);
      this.images.set(file, image);
    }
    const size = pv_image_size(image);
    const layout = layoutImage(size.x, size.y, width, frameHeight, fit);
    const cursor = igGetCursorScreenPos();
    // Leave antialiased edges inside the recorded block bounds.
    const start = { x: cursor.x, y: cursor.y + 1 };
    const end = { x: start.x + layout.width, y: start.y + layout.height };
    const draw = igGetWindowDrawList();
    if (!draw) throw new Error("Cannot access the image canvas");
    if (frameHeight !== undefined)
      ImDrawList_AddRectFilled(
        draw,
        start,
        end,
        packed(palette.paper),
        layout.rounding,
        0,
      );
    const fillsFrame =
      layout.image.width === layout.width &&
      layout.image.height === layout.height;
    pv_image_draw(
      image,
      { x: start.x + layout.image.x, y: start.y + layout.image.y },
      { x: layout.image.width, y: layout.image.height },
      layout.uv0,
      layout.uv1,
      fillsFrame ? layout.rounding : 0,
    );
    if (frameHeight !== undefined)
      ImDrawList_AddRect(
        draw,
        start,
        end,
        packed(palette.border),
        layout.rounding,
        1,
        0,
      );
    keepTogether(cursor.y, end.y + 1);
    igDummy({ x: layout.width, y: layout.height + 2 });
    return layout.height + 2;
  }
  hasControls(): boolean {
    return controls(this.document).length > 0;
  }
  resetControls() {
    this.state.parameters = createParameters(this.document);
    this.state.revision++;
    this.controlInputs.clear();
  }
  private parameter(control: ControlBlock, value: ParameterValue) {
    if (
      JSON.stringify(parameterValue(this.state.parameters, control.id)) ===
      JSON.stringify(value)
    )
      return;
    this.state.parameters.set(control.id, value);
    this.state.revision++;
  }
  body(exporting: boolean) {
    if (exporting) this.renderBody(true);
    else withTextSelection(this.selection, () => this.renderBody(false));
  }
  private renderBody(exporting: boolean) {
    if (!this.view || this.viewRevision !== this.state.revision) {
      this.barPress = undefined;
      this.view = resolveView(this.document, this.state.parameters);
      this.viewRevision = this.state.revision;
      this.orders.clear();
      this.plots.clear();
      this.tableCells.clear();
      this.cellWidths.clear();
      this.categoryLayouts.clear();
    }
    const headerTop = igGetCursorScreenPos().y;
    text(
      `PROJECT VISUALIZE  /  ${(this.document.category ?? "ARTIFACT").toUpperCase()}`,
      12,
      "bold",
      palette.accent,
    );
    text(this.document.title, 38, "bold");
    if (this.document.subtitle)
      text(this.document.subtitle, 19, "regular", palette.muted);
    igSpacing();
    igSeparator();
    igSpacing();
    keepTogether(headerTop, igGetCursorScreenPos().y);
    this.blocks(this.view.body, exporting, "body");
    if (!exporting && !igIsMouseDown_Nil(0)) this.barPress = undefined;
    igSpacing();
  }
  private blocks(
    children: Block[],
    exporting: boolean,
    parent: string,
    parentHeading?: number,
  ) {
    for (let i = 0; i < children.length; i++) {
      const block = children[i];
      if (parent === "body" && block.pageBreakBefore)
        currentCapture()?.breaks.push(
          Math.max(0, Math.floor(igGetCursorScreenPos().y) - 1),
        );
      const key = `${parent}.${block.id ?? i}`;
      igPushID_Str(block.id ?? String(i));
      this.block(block, exporting, key, parentHeading);
      igPopID();
    }
  }
  private block(
    value: Block,
    exporting: boolean,
    key: string,
    parentHeading?: number,
  ) {
    const top = igGetCursorScreenPos().y;
    let heading = parentHeading;
    const capture = currentCapture();
    let bodyLineStart: number | undefined;
    if (value.title && !["callout", "details", "card"].includes(value.type)) {
      heading = captureHeading(value.title, top, parentHeading);
      text(value.title, 22, "bold");
      bodyLineStart = capture?.lines.length;
    }
    switch (value.type) {
      case "markdown":
        this.rich.markdown(value.content, exporting, heading);
        break;
      case "text":
        text(value.content);
        break;
      case "divider":
        igSpacing();
        igSeparator();
        igSpacing();
        break;
      case "spacer":
        igDummy({ x: 0, y: value.height ?? 12 });
        break;
      case "metric":
        panel(() => {
          text(value.label, 13, "bold", palette.muted);
          let display = scalar(value.value);
          if (typeof value.value === "number")
            display = formatNumber(value.value, value);
          text(display, 36, "bold");
          text(value.detail ?? "", 15, "regular", tone(value.tone));
        });
        break;
      case "control":
        this.control(value, exporting);
        break;
      case "progress":
        text(`${value.label} · ${Math.round(value.value * 100)}%`, 17, "bold");
        igPushStyleColor_Vec4(
          ImGuiCol_PlotHistogram,
          value.tone ? tone(value.tone) : palette.accent,
        );
        igProgressBar(value.value, { x: -1, y: 14 }, "");
        igPopStyleColor(1);
        if (value.detail) text(value.detail, 15, "regular", palette.muted);
        break;
      case "badge": {
        const origin = igGetCursorScreenPos(),
          face = fonts.bold;
        if (!face) throw new Error("Fonts are not initialized");
        const width = Math.max(20, available() - 20);
        igPushFont(face, 13);
        const size = igCalcTextSize(value.label, false, width);
        igPopFont();
        const draw = igGetWindowDrawList();
        if (!draw) throw new Error("Cannot access the badge canvas");
        const tint = tone(value.tone ?? "positive");
        ImDrawList_AddRectFilled(
          draw,
          origin,
          { x: origin.x + size.x + 20, y: origin.y + size.y + 12 },
          packed({ ...tint, w: 0.1 }),
          8,
          0,
        );
        igSetCursorScreenPos({ x: origin.x + 10, y: origin.y + 6 });
        text(value.label, 13, "bold", tint, width);
        igSetCursorScreenPos(origin);
        igDummy({ x: size.x + 20, y: size.y + 12 });
        break;
      }
      case "timeline":
        this.timeline(value, exporting, heading);
        break;
      case "row":
      case "column":
        if (value.type === "column" || available() < 620)
          this.blocks(value.children, exporting, key, heading);
        else {
          igPushStyleVar_Vec2(ImGuiStyleVar_CellPadding, { x: 8, y: 0 });
          if (
            igBeginTable(
              "row",
              value.children.length,
              ImGuiTableFlags_SizingStretchSame,
              { x: 0, y: 0 },
              0,
            )
          ) {
            for (let i = 0; i < value.children.length; i++)
              igTableSetupColumn(
                "",
                ImGuiTableColumnFlags_WidthStretch,
                value.weights?.[i] ?? 1,
                0,
              );
            igTableNextRow(0, 0);
            for (let i = 0; i < value.children.length; i++) {
              igTableNextColumn();
              igPushID_Int(i);
              this.block(
                value.children[i],
                exporting,
                `${key}.${value.children[i].id ?? i}`,
                heading,
              );
              igPopID();
            }
            igEndTable();
          }
          igPopStyleVar(1);
        }
        break;
      case "card":
        panel(() => {
          if (value.title) {
            heading = captureHeading(
              value.title,
              igGetCursorScreenPos().y,
              parentHeading,
            );
            text(value.title, 21, "bold");
            bodyLineStart = capture?.lines.length;
          }
          this.blocks(value.children, exporting, key, heading);
        });
        break;
      case "callout":
        panel(
          () => {
            if (value.title) {
              heading = captureHeading(
                value.title,
                igGetCursorScreenPos().y,
                parentHeading,
              );
              text(value.title, 21, "bold", tone(value.tone ?? "positive"));
              bodyLineStart = capture?.lines.length;
            }
            this.rich.markdown(value.content, exporting, heading);
          },
          { ...tone(value.tone ?? "positive"), w: 0.08 },
        );
        break;
      case "details":
        if (exporting) {
          if (value.title) {
            heading = captureHeading(
              value.title,
              igGetCursorScreenPos().y,
              parentHeading,
            );
            text(value.title, 21, "bold");
            bodyLineStart = capture?.lines.length;
          }
          this.blocks(value.children, exporting, key, heading);
        } else if (
          igCollapsingHeader_TreeNodeFlags(
            value.title ?? "Details",
            ImGuiTreeNodeFlags_DefaultOpen,
          )
        )
          this.blocks(value.children, exporting, key, heading);
        break;
      case "code":
        this.rich.code(value.content, value.language ?? "", exporting);
        break;
      case "table":
        this.table(value, exporting, key);
        break;
      case "chart":
        this.chart(value, exporting, key);
        break;
      case "heatmap":
        this.heatmap(value, exporting);
        break;
      case "diagram":
        this.diagram(value, exporting);
        break;
      case "image":
        this.image(value.asset, available(), value.height, value.fit);
        break;
    }
    if (value.caption) text(value.caption, 15, "regular", palette.muted);
    if (bodyLineStart !== undefined) {
      const firstLine = capture?.lines[bodyLineStart];
      if (firstLine) keepTogether(top, firstLine.bottom);
    }
    if (value.type !== "spacer") {
      const bottom = igGetCursorScreenPos().y;
      // Event spans let a timeline flow beneath a parent title without one oversized chain.
      if (value.type !== "timeline") keepTogether(top, bottom);
      keepTogether(top, Math.min(top + 48, bottom));
      keepTogether(Math.max(top, bottom - 48), bottom);
    }
  }
  private timeline(
    value: Extract<Block, { type: "timeline" }>,
    exporting: boolean,
    heading?: number,
  ) {
    const origin = igGetCursorScreenPos(),
      draw = igGetWindowDrawList();
    if (!draw) throw new Error("Cannot access the timeline canvas");
    const points: { y: number; tint: Color }[] = [];
    igIndent(32);
    for (const [index, event] of value.events.entries()) {
      igPushID_Int(index);
      const top = igGetCursorScreenPos().y;
      points.push({ y: top + 9, tint: tone(event.tone ?? "positive") });
      if (event.label) text(event.label, 12, "bold", palette.muted);
      text(event.title, 20, "bold");
      if (event.content) this.rich.markdown(event.content, exporting, heading);
      keepTogether(top, igGetCursorScreenPos().y);
      igDummy({ x: 0, y: 8 });
      igPopID();
    }
    igUnindent(32);
    for (let i = 1; i < points.length; i++)
      ImDrawList_AddLine(
        draw,
        { x: origin.x + 7, y: points[i - 1].y },
        { x: origin.x + 7, y: points[i].y },
        packed(palette.border),
        2,
        0,
      );
    for (const point of points)
      ImDrawList_AddCircleFilled(
        draw,
        { x: origin.x + 7, y: point.y },
        5,
        packed(point.tint),
        0,
      );
  }
  private control(control: ControlBlock, exporting: boolean) {
    const current = parameterValue(this.state.parameters, control.id);
    let options = this.controlChoices.get(control.id);
    if (!options) {
      const values = choices(this.document, control);
      options = { values, labels: labels(values) };
      this.controlChoices.set(control.id, options);
    }
    const selected =
      current === null || typeof current !== "object"
        ? options.values.indexOf(current)
        : -1;
    const preview = isAll(current)
      ? "All values"
      : control.kind === "toggle"
        ? current === true
          ? "On"
          : "Off"
        : control.kind === "range" && current && typeof current === "object"
          ? `${current.min ?? "Any"} to ${current.max ?? "Any"}`
          : selected >= 0
            ? options.labels[selected]
            : scalar(current);
    if (exporting) {
      text(control.label, 12, "bold", palette.muted);
      text(preview || "All", 17);
      return;
    }
    if (control.kind === "toggle") {
      const result = igCheckbox(control.label, current === true);
      if (result.result) this.parameter(control, result.v);
      return;
    }
    text(control.label, 12, "bold", palette.muted);
    igSetNextItemWidth(-1);
    if (control.kind === "select") {
      if (igBeginCombo("##value", preview, 0)) {
        if (igSelectable_Bool("All values", isAll(current), 0, { x: 0, y: 0 }))
          this.parameter(control, ALL);
        for (let i = 0; i < options.values.length; i++)
          if (
            igSelectable_Bool(
              `${options.labels[i]}##${i}`,
              !isAll(current) && options.values[i] === current,
              0,
              { x: 0, y: 0 },
            )
          )
            this.parameter(control, options.values[i]);
        igEndCombo();
      }
    } else if (control.kind === "search") {
      let buffer = this.controlInputs.get(control.id);
      if (!buffer) {
        buffer = inputBuffer(typeof current === "string" ? current : "", 1024);
        this.controlInputs.set(control.id, buffer);
      }
      if (input("##value", "Search…", buffer))
        this.parameter(control, inputValue(buffer));
    } else {
      const bounds = numericBounds(this.document, control);
      const range =
        current !== null && typeof current === "object" && !isAll(current)
          ? current
          : {};
      bounds.min = Math.min(
        bounds.min,
        range.min ?? bounds.min,
        range.max ?? bounds.max,
      );
      bounds.max = Math.max(
        bounds.max,
        range.min ?? bounds.min,
        range.max ?? bounds.max,
      );
      let min = range.min ?? bounds.min,
        max = range.max ?? bounds.max;
      igBeginDisabled(bounds.min === bounds.max);
      igSetNextItemWidth(Math.max(80, available() - 60));
      const lower = pv_slider_double("From", min, bounds.min, max);
      if (lower.result) {
        min = lower.value;
        this.parameter(control, { min, max });
      }
      igSetNextItemWidth(Math.max(80, available() - 60));
      const upper = pv_slider_double("To", max, min, bounds.max);
      if (upper.result) {
        max = upper.value;
        this.parameter(control, { min, max });
      }
      igEndDisabled();
      if (igSmallButton("All values")) this.parameter(control, ALL);
    }
  }
  private table(value: TableBlock, exporting: boolean, key: string) {
    this.state.tables[key] ??= { query: "" };
    const state = this.state.tables[key];
    const rows = value.rows ?? [];
    let cells = this.tableCells.get(value);
    if (!cells) {
      const values = rows.map((row) =>
        value.columns.map((column) => {
          const raw = cell(row, column.key);
          return typeof raw === "number" && column.format
            ? formatNumber(raw, column.format)
            : scalar(raw);
        }),
      );
      const right = value.columns.map((column) =>
        column.align !== undefined
          ? column.align === "right"
          : rows.some((row) => typeof cell(row, column.key) === "number") &&
            rows.every(
              (row) =>
                cell(row, column.key) === null ||
                typeof cell(row, column.key) === "number",
            ),
      );
      cells = { values, right };
      this.tableCells.set(value, cells);
    }
    let buffer = this.searches.get(key);
    if (!buffer) {
      buffer = inputBuffer(state.query);
      this.searches.set(key, buffer);
    }
    if (!exporting && (rows.length > 5 || state.query.length > 0)) {
      igSetNextItemWidth(Math.min(300, available()));
      if (input("##search", "Filter rows…", buffer))
        state.query = inputValue(buffer);
    }
    let flags =
      ImGuiTableFlags_BordersInnerH |
      ImGuiTableFlags_RowBg |
      ImGuiTableFlags_SizingStretchSame;
    if (!exporting)
      flags |= ImGuiTableFlags_Sortable | ImGuiTableFlags_SortMulti;
    const capture = currentCapture();
    const textStart = capture?.text.length ?? 0;
    const rowStarts: number[] = [];
    const tableTop = igGetCursorScreenPos().y;
    let empty: "view" | "search" | undefined;
    if (igBeginTable("data", value.columns.length, flags, { x: 0, y: 0 }, 0)) {
      for (const column of value.columns)
        igTableSetupColumn(
          column.label,
          ImGuiTableColumnFlags_WidthStretch,
          column.weight ?? 1,
          0,
        );
      if (exporting) {
        igTableNextRow(ImGuiTableRowFlags_Headers, 0);
        for (const column of value.columns) {
          igTableNextColumn();
          text(column.label, 16, "bold");
        }
      } else igTableHeadersRow();
      const textEnd = capture?.text.length ?? 0;
      const sort: { column: number; direction: number }[] = [];
      if (!exporting) {
        const first = pv_table_sort(0);
        for (let i = 0; i < first.count; i++) {
          const spec = i === 0 ? first : pv_table_sort(i);
          sort.push({ column: spec.column, direction: spec.direction });
        }
      }
      const query = exporting ? "" : state.query.toLowerCase();
      const signature = JSON.stringify([query, sort]);
      let cached = this.orders.get(key);
      if (!cached || cached.key !== signature) {
        const formatted = cells.values;
        const indices = rows
          .map((_, i) => i)
          .filter(
            (i) =>
              !query ||
              formatted[i].join(" ").toLowerCase().includes(query) ||
              value.columns
                .map((c) => scalar(cell(rows[i], c.key)))
                .join(" ")
                .toLowerCase()
                .includes(query),
          );
        if (sort.length)
          indices.sort((a, b) => {
            for (const spec of sort) {
              const field = value.columns[spec.column].key;
              const x = cell(rows[a], field),
                y = cell(rows[b], field);
              const order =
                typeof x === "number" && typeof y === "number"
                  ? x - y
                  : scalar(x).localeCompare(scalar(y));
              if (order) return spec.direction === 1 ? order : -order;
            }
            return 0;
          });
        cached = { key: signature, indices };
        this.orders.set(key, cached);
      }
      if (!cached.indices.length) empty = rows.length ? "search" : "view";
      for (const index of cached.indices) {
        igTableNextRow(0, 0);
        if (capture) rowStarts.push(igGetCursorScreenPos().y);
        for (let column = 0; column < value.columns.length; column++) {
          igTableNextColumn();
          const display = cells.values[index][column];
          if (cells.right[column] && display) {
            let width = this.cellWidths.get(display);
            if (width === undefined) {
              const face = fonts.regular;
              if (!face) throw new Error("Fonts are not initialized");
              igPushFont(face, 16);
              width = igCalcTextSize(display, false, -1).x;
              igPopFont();
              this.cellWidths.set(display, width);
            }
            const position = igGetCursorScreenPos();
            igSetCursorScreenPos({
              x: position.x + Math.max(0, available() - width),
              y: position.y,
            });
          }
          text(display, 16);
        }
      }
      igEndTable();
      if (capture) {
        const min = igGetItemRectMin(),
          max = igGetItemRectMax();
        captureTable(
          min.x,
          max.x,
          tableTop,
          max.y,
          rowStarts,
          textStart,
          textEnd,
        );
      }
    }
    if (empty) {
      text(
        empty === "search"
          ? "No rows match this search."
          : "No rows in this view.",
        16,
        "regular",
        palette.muted,
      );
      if (!exporting && empty === "search" && igSmallButton("Clear search")) {
        state.query = "";
        buffer.fill(0);
      }
    }
  }
  private heatmap(
    value: Extract<Block, { type: "heatmap" }>,
    exporting: boolean,
  ) {
    const xs = value.x ?? [],
      ys = value.y ?? [],
      values = value.values ?? [];
    if (!xs.length || !ys.length) {
      text("No observations in this dataset.", 16, "regular", palette.muted);
      return;
    }
    const xLabels = labels(xs),
      yLabels = labels(ys);
    const width = available(),
      labelWidth = Math.min(180, Math.max(72, width * 0.24));
    const bandSize = Math.max(1, Math.floor((width - labelWidth) / 72));
    const min = value.min ?? 0,
      max = value.max ?? 0;
    const format = (number: number) =>
      `${value.decimals === undefined ? number : number.toFixed(value.decimals)}${value.suffix ?? ""}`;
    if (value.xLabel) text(value.xLabel, 13, "bold", palette.muted);
    igPushStyleVar_Vec2(ImGuiStyleVar_CellPadding, { x: 8, y: 7 });
    for (let first = 0; first < xs.length; first += bandSize) {
      const count = Math.min(bandSize, xs.length - first);
      const capture = currentCapture(),
        textStart = capture?.text.length ?? 0;
      const rowStarts: number[] = [];
      const tableTop = igGetCursorScreenPos().y;
      igPushID_Int(first);
      if (
        igBeginTable(
          "heatmap",
          count + 1,
          ImGuiTableFlags_SizingStretchSame | ImGuiTableFlags_BordersInnerH,
          { x: 0, y: 0 },
          0,
        )
      ) {
        igTableSetupColumn("", ImGuiTableColumnFlags_WidthFixed, labelWidth, 0);
        for (let column = 0; column < count; column++)
          igTableSetupColumn("", ImGuiTableColumnFlags_WidthStretch, 1, 0);
        igTableNextRow(ImGuiTableRowFlags_Headers, 0);
        igTableNextColumn();
        text(value.yLabel ?? "", 14, "bold");
        for (let column = first; column < first + count; column++) {
          igTableNextColumn();
          text(xLabels[column], 14, "bold");
        }
        const textEnd = capture?.text.length ?? 0;
        for (let row = 0; row < ys.length; row++) {
          igTableNextRow(0, 0);
          if (capture) rowStarts.push(igGetCursorScreenPos().y);
          igTableNextColumn();
          text(yLabels[row], 15, "bold");
          for (let column = first; column < first + count; column++) {
            igTableNextColumn();
            const cell = values[row][column];
            const fill =
              cell === null ? palette.code : heatColor(cell, min, max);
            igTableSetBgColor(ImGuiTableBgTarget_CellBg, packed(fill), -1);
            text(
              cell === null ? "Missing" : format(cell),
              15,
              cell === null ? "regular" : "mono",
              cell === null ? palette.muted : heatText(fill),
            );
            if (!exporting && igIsItemHovered(0))
              tooltip(
                `${yLabels[row]} / ${xLabels[column]}: ${cell === null ? "Missing" : format(cell)}`,
              );
          }
        }
        igEndTable();
        if (capture) {
          const low = igGetItemRectMin(),
            high = igGetItemRectMax();
          captureTable(
            low.x,
            high.x,
            tableTop,
            high.y,
            rowStarts,
            textStart,
            textEnd,
          );
        }
      }
      igPopID();
      if (first + count < xs.length) igSpacing();
    }
    igPopStyleVar(1);
    const observed = values.some((row) => row.some((cell) => cell !== null));
    if (!observed)
      text(
        "No numeric observations in this view.",
        13,
        "regular",
        palette.muted,
      );
    else {
      const origin = igGetCursorScreenPos(),
        draw = igGetWindowDrawList();
      if (!draw) throw new Error("Cannot access the heatmap scale");
      const legendWidth = Math.min(160, width * 0.3);
      for (let step = 0; step < 32; step++)
        ImDrawList_AddRectFilled(
          draw,
          { x: origin.x + (step * legendWidth) / 32, y: origin.y + 4 },
          { x: origin.x + ((step + 1) * legendWidth) / 32, y: origin.y + 14 },
          packed(heatColor(min + ((max - min) * step) / 31, min, max)),
          0,
          0,
        );
      igSetCursorScreenPos({ x: origin.x + legendWidth + 12, y: origin.y });
      text(
        min === max ? format(min) : `${format(min)} to ${format(max)}`,
        13,
        "regular",
        palette.muted,
      );
    }
  }
  private categories(value: ChartBlock) {
    if (value.kind !== "bar" || !value.labels) return;
    const width = available();
    const cached = this.categoryLayouts.get(value);
    if (cached?.width === width) return cached;
    const widths = value.labels.map(
      (label) => igCalcTextSize(label, false, -1).x,
    );
    const horizontal = crowdedCategories(widths, Math.max(1, width - 100));
    const labels = horizontal
      ? value.labels.map((label) => {
          const lines: string[] = [];
          let remaining = label;
          while (remaining) {
            const line = textLine(
              remaining,
              Math.max(60, Math.min(260, width * 0.35)),
            );
            lines.push(remaining.slice(0, line.length).trimEnd());
            remaining = remaining.slice(line.consumed);
          }
          return lines.join("\n");
        })
      : value.labels;
    const rowHeight =
      Math.max(...labels.map((label) => igCalcTextSize(label, false, -1).y)) +
      10;
    const height = horizontal
      ? Math.max(
          value.height ?? 300,
          Math.min(1200, labels.length * rowHeight + 100),
        )
      : (value.height ?? 300);
    const stride = horizontal
      ? Math.max(1, Math.ceil((labels.length * rowHeight) / (height - 100)))
      : 1;
    const layout = { width, horizontal, height, labels, stride };
    this.categoryLayouts.set(value, layout);
    return layout;
  }
  private chart(value: ChartBlock, exporting: boolean, key: string) {
    const series = value.series ?? [];
    if (!series.length) {
      const origin = igGetCursorScreenPos();
      text("No data matches the controls.", 16, "regular", palette.muted);
      igSetCursorScreenPos(origin);
      igDummy({ x: available(), y: value.height ?? 300 });
      return;
    }
    const categories = this.categories(value);
    const horizontalBars = categories?.horizontal ?? false;
    const interactionKey = horizontalBars ? `${key}.horizontal` : key;
    const fitKey = this.view?.chartFitKeys.get(key);
    const refit =
      fitKey !== undefined &&
      this.state.chartFits.get(interactionKey) !== fitKey;
    if (exporting || refit) ImPlot_SetNextAxesToFit();
    const selection = this.view?.chartSelections.get(key);
    const choosing =
      !exporting && selection !== undefined && igIsKeyDown_Nil(ImGuiMod_Shift);
    let flags =
      ImPlotFlags_NoTitle |
      (choosing ? ImPlotFlags_NoMouseText : ImPlotFlags_Crosshairs);
    // ImPlot fits on any double-click modifier, so Shift belongs to selection.
    if (exporting || choosing) flags |= ImPlotFlags_NoInputs;
    if (exporting || selection) flags |= ImPlotFlags_NoMenus;
    const plotTop = igGetCursorScreenPos().y;
    if (
      !ImPlot_BeginPlot(
        horizontalBars ? "##chart-horizontal" : "##chart",
        { x: -1, y: categories?.height ?? value.height ?? 300 },
        flags,
      )
    )
      return;
    if (refit && fitKey !== undefined)
      this.state.chartFits.set(interactionKey, fitKey);
    ImPlot_SetupAxes(
      horizontalBars ? (value.yLabel ?? "") : (value.xLabel ?? ""),
      horizontalBars ? (value.xLabel ?? "") : (value.yLabel ?? ""),
      0,
      horizontalBars ? ImPlotAxisFlags_Invert : 0,
    );
    const horizontal =
      series.reduce(
        (sum, item) => sum + igCalcTextSize(item.name, false, -1).x + 32,
        0,
      ) <
      available() - 40;
    ImPlot_SetupLegend(
      horizontal
        ? ImPlotLocation_South
        : selection
          ? ImPlotLocation_East
          : ImPlotLocation_NorthWest,
      ImPlotLegendFlags_NoMenus |
        (horizontal || selection ? ImPlotLegendFlags_Outside : 0) |
        (horizontal ? ImPlotLegendFlags_Horizontal : 0),
    );
    if (value.labels)
      for (let i = 0; i < value.labels.length; i++)
        if (i % (categories?.stride ?? 1) === 0)
          pv_plot_tick(
            horizontalBars ? ImAxis_Y1 : 0,
            i,
            categories?.labels[i] ?? value.labels[i],
          );
    const selected = selection
      ? parameterValue(this.state.parameters, selection.control)
      : ALL;
    const selectedIndex =
      selection && (selected === null || typeof selected !== "object")
        ? selection.values.indexOf(selected)
        : -1;
    if (selectedIndex >= 0) {
      const origin = ImPlot_GetPlotPos(),
        size = ImPlot_GetPlotSize();
      const left = horizontalBars
        ? ImPlot_PlotToPixels_double(0, selectedIndex - 0.4, -1, -1).y
        : ImPlot_PlotToPixels_double(selectedIndex - 0.4, 0, -1, -1).x;
      const right = horizontalBars
        ? ImPlot_PlotToPixels_double(0, selectedIndex + 0.4, -1, -1).y
        : ImPlot_PlotToPixels_double(selectedIndex + 0.4, 0, -1, -1).x;
      const draw = ImPlot_GetPlotDrawList();
      if (!draw) throw new Error("Cannot access the chart canvas");
      ImPlot_PushPlotClipRect(0);
      ImDrawList_AddRectFilled(
        draw,
        horizontalBars
          ? { x: origin.x, y: Math.min(left, right) }
          : { x: Math.min(left, right), y: origin.y },
        horizontalBars
          ? { x: origin.x + size.x, y: Math.max(left, right) }
          : { x: Math.max(left, right), y: origin.y + size.y },
        packed({
          ...palette.accent,
          w: currentTheme() === "dark" ? 0.16 : 0.09,
        }),
        0,
        0,
      );
      ImPlot_PopPlotClipRect();
    }
    let data = this.plots.get(value);
    if (!data) {
      data = series.map((item, index) => {
        const x = new Float64Array(item.values.length);
        for (let i = 0; i < x.length; i++) x[i] = item.x?.[i] ?? i;
        if (value.kind === "bar") {
          const width = 0.8 / series.length;
          for (let i = 0; i < x.length; i++)
            x[i] += (index - (series.length - 1) / 2) * width;
        }
        return { x, y: new Float64Array(item.values) };
      });
      this.plots.set(value, data);
    }
    for (let i = 0; i < series.length; i++) {
      this.plotDrawing.draw(
        series[i].name,
        data[i].x,
        data[i].y,
        value.kind,
        seriesColors[i % seriesColors.length],
        0.8 / series.length,
        horizontalBars,
      );
    }
    if (!exporting) {
      let hovered = ImPlot_IsPlotHovered();
      if (choosing) {
        const origin = ImPlot_GetPlotPos(),
          size = ImPlot_GetPlotSize();
        hovered =
          igIsWindowHovered(ImGuiHoveredFlags_AllowWhenBlockedByActiveItem) &&
          igIsMouseHoveringRect(
            origin,
            { x: origin.x + size.x, y: origin.y + size.y },
            true,
          );
      }
      const hidden = hovered
        ? series.map((item) => ImPlot_IsItemHidden(item.name))
        : [];
      const nativeMouse = hovered
        ? ImPlot_GetPlotMousePos(-1, -1)
        : { x: 0, y: 0 };
      const mouse = horizontalBars
        ? { x: nativeMouse.y, y: nativeMouse.x }
        : nativeMouse;
      let category: number | undefined;
      if (selection && hovered) {
        const pixel = igGetMousePos();
        const near = ImPlot_PixelsToPlot_Vec2(
          {
            x: pixel.x + (horizontalBars ? 3 : 0),
            y: pixel.y + (horizontalBars ? 0 : 3),
          },
          -1,
          -1,
        );
        category = barAt(
          data,
          series,
          hidden,
          mouse,
          0.8 / series.length,
          Math.abs((horizontalBars ? near.x : near.y) - mouse.y),
        );
      }
      if (selection) {
        const shift = igIsKeyDown_Nil(ImGuiMod_Shift);
        if (
          hovered &&
          shift &&
          igIsMouseClicked_Bool(0, false) &&
          category !== undefined
        )
          this.barPress = {
            key: interactionKey,
            revision: this.viewRevision,
            value: selection.values[category],
          };
        if (this.barPress?.key === interactionKey && igIsMouseReleased_Nil(0)) {
          const press = this.barPress;
          const delta = igGetMouseDragDelta(0, 0);
          // Include release-frame movement; native drag history also catches an out-and-back drag.
          const dragged =
            igIsMouseDragPastThreshold(0, -1) ||
            Math.hypot(delta.x, delta.y) > 6;
          if (
            shift &&
            !dragged &&
            category !== undefined &&
            press.revision === this.state.revision &&
            press.value === selection.values[category]
          ) {
            const control = controls(this.document).find(
              (control) => control.id === selection.control,
            );
            if (control)
              this.parameter(
                control,
                parameterValue(this.state.parameters, control.id) ===
                  press.value
                  ? ALL
                  : press.value,
              );
          }
          this.barPress = undefined;
        }
      }
      if (hovered) {
        const lines: string[] = [];
        if (selection && category !== undefined) {
          lines.push(
            value.labels?.[category] ?? scalar(selection.values[category]),
          );
          for (let i = 0; i < series.length; i++) {
            if (hidden[i]) continue;
            const j = series[i].x?.indexOf(category) ?? -1;
            if (j >= 0) lines.push(`${series[i].name}: ${series[i].values[j]}`);
          }
          lines.push("Shift-click to select; repeat to clear");
        } else if (!selection)
          for (let i = 0; i < series.length; i++) {
            if (hidden[i]) continue;
            let nearest = 0;
            const { x, y } = data[i];
            for (let j = 1; j < x.length; j++)
              if (Math.abs(x[j] - mouse.x) < Math.abs(x[nearest] - mouse.x))
                nearest = j;
            lines.push(`${series[i].name}: ${y[nearest]}`);
            if (value.labels && i === 0)
              lines.unshift(
                value.labels[series[i].x?.[nearest] ?? nearest] ?? "",
              );
          }
        if (lines.length) tooltip(lines.join("\n"));
      }
    }
    ImPlot_EndPlot();
    keepTogether(plotTop, igGetCursorScreenPos().y);
    if (selection && !isAll(selected))
      text(
        selectedIndex >= 0
          ? `Selected: ${value.labels?.[selectedIndex] ?? scalar(selected)}. Other bars remain for comparison.`
          : `Selected: ${scalar(selected)} (no matching category).`,
        13,
        "regular",
        palette.accent,
      );
    if (!exporting && selection) {
      text(
        "Shift-click a bar to filter; repeat to clear.",
        13,
        "regular",
        palette.muted,
      );
      if (
        !isAll(parameterValue(this.state.parameters, selection.control)) &&
        igSmallButton("Clear chart selection")
      ) {
        const control = controls(this.document).find(
          (control) => control.id === selection.control,
        );
        if (control) this.parameter(control, ALL);
      }
    }
  }

  private diagram(value: DiagramBlock, exporting: boolean) {
    const width = available(),
      columns = Math.min(3, value.nodes.length),
      rows = Math.ceil(value.nodes.length / columns),
      horizontalBoxWidth = Math.min(180, width / 3.5);
    const face = fonts.regular;
    if (!face) throw new Error("Fonts are not initialized");
    let connectorWidth = 48;
    igPushFont(face, 15);
    for (const edge of value.edges ?? [])
      if (edge.label)
        connectorWidth = Math.max(
          connectorWidth,
          igCalcTextSize(edge.label, false, -1).x + 16,
        );
    igPopFont();
    const narrow =
      width < 520 ||
      (columns > 1 && width / columns - horizontalBoxWidth < connectorWidth);
    const height = Math.max(
      value.height ?? 320,
      (narrow ? value.nodes.length : rows) * 94 + 24,
    );
    const origin = igGetCursorScreenPos();
    const draw = igGetWindowDrawList();
    if (!draw) throw new Error("Cannot access the diagram canvas");
    const boxWidth = narrow ? Math.min(180, width - 24) : horizontalBoxWidth,
      boxHeight = 66;
    const positions = value.nodes.map((node, i) => ({
      x: narrow
        ? origin.x + width / 2
        : origin.x +
          (node.x === undefined
            ? (((i % columns) + 0.5) * width) / columns
            : boxWidth / 2 + node.x * (width - boxWidth)),
      y: narrow
        ? origin.y + boxHeight / 2 + 12 + i * 94
        : origin.y +
          (node.y === undefined
            ? ((Math.floor(i / columns) + 0.5) * height) / rows
            : boxHeight / 2 + node.y * (height - boxHeight)),
    }));
    const ids = new Map(value.nodes.map((node, i) => [node.id, i]));
    for (const edge of value.edges ?? []) {
      const a = positions[ids.get(edge.from) ?? 0],
        b = positions[ids.get(edge.to) ?? 0];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      const fraction = Math.min(
        boxWidth / (2 * Math.max(0.1, Math.abs(dx))),
        boxHeight / (2 * Math.max(0.1, Math.abs(dy))),
      );
      const start = { x: a.x + dx * fraction, y: a.y + dy * fraction },
        end = { x: b.x - dx * fraction, y: b.y - dy * fraction };
      const angle = Math.atan2(dy, dx);
      ImDrawList_AddLine(draw, start, end, packed(palette.muted), 1.5, 0);
      ImDrawList_AddTriangleFilled(
        draw,
        end,
        {
          x: end.x - 9 * Math.cos(angle - 0.45),
          y: end.y - 9 * Math.sin(angle - 0.45),
        },
        {
          x: end.x - 9 * Math.cos(angle + 0.45),
          y: end.y - 9 * Math.sin(angle + 0.45),
        },
        packed(palette.muted),
      );
      if (edge.label) {
        const face = fonts.regular;
        if (!face) throw new Error("Fonts are not initialized");
        igPushFont(face, 15);
        const size = igCalcTextSize(edge.label, false, -1);
        igPopFont();
        const p = {
          x: (a.x + b.x - size.x) / 2,
          y: (a.y + b.y - size.y) / 2 - 4,
        };
        ImDrawList_AddRectFilled(
          draw,
          { x: p.x - 4, y: p.y - 2 },
          { x: p.x + size.x + 4, y: p.y + size.y + 2 },
          packed(palette.paper),
          3,
          0,
        );
        ImDrawList_AddText_FontPtr(
          draw,
          face,
          15,
          p,
          packed(palette.muted),
          edge.label,
          0,
        );
        captureWrappedText(edge.label, "regular", 15, p, 0);
      }
    }
    for (let i = 0; i < value.nodes.length; i++) {
      const node = value.nodes[i],
        center = positions[i],
        a = { x: center.x - boxWidth / 2, y: center.y - boxHeight / 2 },
        b = { x: center.x + boxWidth / 2, y: center.y + boxHeight / 2 };
      ImDrawList_AddRectFilled(draw, a, b, packed(palette.surface), 9, 0);
      ImDrawList_AddRect(
        draw,
        a,
        b,
        packed(tone(node.tone ?? "positive")),
        9,
        1.5,
        0,
      );
      const face = fonts.bold;
      if (!face) throw new Error("Fonts are not initialized");
      igPushFont(face, 17);
      const size = igCalcTextSize(node.label, false, boxWidth - 16);
      igPopFont();
      ImDrawList_AddText_FontPtr(
        draw,
        face,
        17,
        { x: center.x - size.x / 2, y: center.y - size.y / 2 },
        packed(palette.ink),
        node.label,
        boxWidth - 16,
      );
      captureWrappedText(
        node.label,
        "bold",
        17,
        { x: center.x - size.x / 2, y: center.y - size.y / 2 },
        boxWidth - 16,
      );
      if (!exporting) {
        igSetCursorScreenPos(a);
        igPushID_Int(i);
        igInvisibleButton("node", { x: boxWidth, y: boxHeight }, 0);
        if (igIsItemHovered(0) && node.detail) tooltip(node.detail);
        igPopID();
      }
    }
    igSetCursorScreenPos(origin);
    igDummy({ x: width, y: height });
  }
}
