import {
  ImDrawList_AddCircleFilled,
  ImDrawList_AddLine,
  ImDrawList_AddRect,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
  ImDrawList_AddTriangleFilled,
  ImGuiCol_PlotHistogram,
  ImGuiMod_Shift,
  ImGuiStyleVar_CellPadding,
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
  ImPlot_GetPlotMousePos,
  ImPlot_IsItemHidden,
  ImPlot_IsPlotHovered,
  ImPlot_PixelsToPlot_Vec2,
  ImPlot_SetNextAxesToFit,
  ImPlot_SetupAxes,
  ImPlot_SetupLegend,
  ImPlotFlags_Crosshairs,
  ImPlotFlags_NoInputs,
  ImPlotFlags_NoMenus,
  ImPlotFlags_NoTitle,
  ImPlotLegendFlags_Horizontal,
  ImPlotLegendFlags_NoMenus,
  ImPlotLegendFlags_Outside,
  ImPlotLocation_East,
  ImPlotLocation_South,
  ImPlotMarker_Circle,
  ImPlotMarker_None,
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
  igIsMouseReleased_Nil,
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
  igTableSetupColumn,
  igUnindent,
  type PVImage,
  pv_image_destroy,
  pv_image_draw,
  pv_image_load,
  pv_image_size,
  pv_plot_series,
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
  ParameterValue,
  Tone,
} from "../model.ts";
import { barAt, type PlotSeries } from "./chart-hit.ts";
import { captureTable, currentCapture, keepTogether } from "./layout.ts";
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
import { type Color, fonts, packed, palette, seriesColors } from "./theme.ts";

export interface DocumentState {
  tables: Record<string, { query: string }>;
  parameters: Parameters;
  revision: number;
  chartFits: Map<string, number>;
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

export class DocumentRenderer {
  readonly document: Artifact;
  readonly state: DocumentState;
  private images = new Map<string, PVImage>();
  private searches = new Map<string, Int8Array>();
  private orders = new Map<string, { key: string; indices: number[] }>();
  private plots = new Map<ChartBlock, PlotSeries[]>();
  private barPress: { key: string; revision: number; value: Cell } | undefined;
  private rich: RichText;
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
    this.orders.clear();
    this.searches.clear();
    this.rich.dispose();
  }
  private image(asset: string, width = available()): number {
    const file = this.document.assets?.[asset];
    if (!file) throw new Error(`Unknown image asset: ${asset}`);
    let image = this.images.get(file);
    if (!image) {
      image = pv_image_load(file) ?? undefined;
      if (!image) throw new Error(`Cannot load image asset: ${asset}`);
      this.images.set(file, image);
    }
    const size = pv_image_size(image);
    const w = Math.min(width, size.x);
    const height = (w * size.y) / size.x;
    pv_image_draw(image, { x: w, y: height });
    return height;
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
    if (!this.view || this.viewRevision !== this.state.revision) {
      this.barPress = undefined;
      this.view = resolveView(this.document, this.state.parameters);
      this.viewRevision = this.state.revision;
      this.orders.clear();
      this.plots.clear();
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
  private blocks(children: Block[], exporting: boolean, parent: string) {
    for (let i = 0; i < children.length; i++) {
      const block = children[i];
      const key = `${parent}.${block.id ?? i}`;
      igPushID_Str(block.id ?? String(i));
      this.block(block, exporting, key);
      igPopID();
    }
  }
  private block(value: Block, exporting: boolean, key: string) {
    const top = igGetCursorScreenPos().y;
    if (value.title && !["callout", "details", "card"].includes(value.type))
      text(value.title, 22, "bold");
    switch (value.type) {
      case "markdown":
        this.rich.markdown(value.content, exporting);
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
          if (typeof value.value === "number") {
            const number =
              value.decimals === undefined
                ? String(value.value)
                : value.value.toFixed(value.decimals);
            const [integer, fraction] = number.split(".");
            display = `${value.prefix ?? ""}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}${value.suffix ?? ""}`;
          }
          text(display, 36, "bold");
          text(value.detail ?? "", 15, "regular", tone(value.tone));
        });
        break;
      case "control":
        this.control(value, exporting);
        break;
      case "progress":
        text(value.label, 17, "bold");
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
        this.timeline(value, exporting);
        break;
      case "row":
      case "column":
        if (value.type === "column" || available() < 620)
          this.blocks(value.children, exporting, key);
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
          if (value.title) text(value.title, 21, "bold");
          this.blocks(value.children, exporting, key);
        });
        break;
      case "callout":
        panel(
          () => {
            if (value.title)
              text(value.title, 21, "bold", tone(value.tone ?? "positive"));
            this.rich.markdown(value.content, exporting);
          },
          { ...tone(value.tone ?? "positive"), w: 0.08 },
        );
        break;
      case "details":
        if (exporting) {
          if (value.title) text(value.title, 21, "bold");
          this.blocks(value.children, exporting, key);
        } else if (
          igCollapsingHeader_TreeNodeFlags(
            value.title ?? "Details",
            ImGuiTreeNodeFlags_DefaultOpen,
          )
        )
          this.blocks(value.children, exporting, key);
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
      case "diagram":
        this.diagram(value, exporting);
        break;
      case "image":
        this.image(value.asset);
        break;
    }
    if (value.caption) text(value.caption, 15, "regular", palette.muted);
    if (value.type !== "spacer" && value.type !== "divider") {
      const bottom = igGetCursorScreenPos().y;
      keepTogether(top, bottom);
      keepTogether(top, Math.min(top + 48, bottom));
      keepTogether(Math.max(top, bottom - 48), bottom);
    }
  }
  private timeline(
    value: Extract<Block, { type: "timeline" }>,
    exporting: boolean,
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
      if (event.content) this.rich.markdown(event.content, exporting);
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
    if (igBeginTable("data", value.columns.length, flags, { x: 0, y: 0 }, 0)) {
      for (const column of value.columns)
        igTableSetupColumn(column.label, 0, 0, 0);
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
        const indices = rows
          .map((_, i) => i)
          .filter(
            (i) =>
              !query ||
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
      for (const index of cached.indices) {
        igTableNextRow(0, 0);
        if (capture) rowStarts.push(igGetCursorScreenPos().y);
        for (const column of value.columns) {
          igTableNextColumn();
          text(scalar(cell(rows[index], column.key)), 16);
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
    const refit =
      this.view?.boundCharts.has(key) &&
      this.state.chartFits.get(key) !== this.viewRevision;
    if (exporting || refit) ImPlot_SetNextAxesToFit();
    let flags = ImPlotFlags_NoTitle | ImPlotFlags_Crosshairs;
    if (exporting) flags |= ImPlotFlags_NoInputs | ImPlotFlags_NoMenus;
    if (!ImPlot_BeginPlot("##chart", { x: -1, y: value.height ?? 300 }, flags))
      return;
    if (refit) this.state.chartFits.set(key, this.viewRevision);
    ImPlot_SetupAxes(value.xLabel ?? "", value.yLabel ?? "", 0, 0);
    const selection = this.view?.chartSelections.get(key);
    if (selection) {
      const horizontal =
        series.reduce(
          (sum, item) => sum + igCalcTextSize(item.name, false, -1).x + 32,
          0,
        ) <
        available() - 40;
      ImPlot_SetupLegend(
        horizontal ? ImPlotLocation_South : ImPlotLocation_East,
        ImPlotLegendFlags_Outside |
          ImPlotLegendFlags_NoMenus |
          (horizontal ? ImPlotLegendFlags_Horizontal : 0),
      );
    }
    if (value.labels)
      for (let i = 0; i < value.labels.length; i++)
        pv_plot_tick(0, i, value.labels[i]);
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
    for (let i = 0; i < series.length; i++)
      pv_plot_series(
        series[i].name,
        data[i].x,
        data[i].y,
        value.kind === "bar" ? 1 : value.kind === "scatter" ? 2 : 0,
        {
          color: seriesColors[i % seriesColors.length],
          line_weight: 2.5,
          marker_size: 4,
          marker:
            value.kind === "scatter" ? ImPlotMarker_Circle : ImPlotMarker_None,
          bar_width: 0.8 / series.length,
        },
      );
    if (!exporting) {
      const hovered = ImPlot_IsPlotHovered();
      const hidden = hovered
        ? series.map((item) => ImPlot_IsItemHidden(item.name))
        : [];
      const mouse = hovered ? ImPlot_GetPlotMousePos(-1, -1) : { x: 0, y: 0 };
      let category: number | undefined;
      if (selection && hovered) {
        const pixel = igGetMousePos();
        const near = ImPlot_PixelsToPlot_Vec2(
          { x: pixel.x, y: pixel.y + 3 },
          -1,
          -1,
        );
        category = barAt(
          data,
          series,
          hidden,
          mouse,
          0.8 / series.length,
          Math.abs(near.y - mouse.y),
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
            key,
            revision: this.viewRevision,
            value: selection.values[category],
          };
        if (this.barPress?.key === key && igIsMouseReleased_Nil(0)) {
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
          }
        if (lines.length) tooltip(lines.join("\n"));
      }
    }
    ImPlot_EndPlot();
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
      narrow = width < 520;
    const height = narrow
      ? Math.max(value.height ?? 320, value.nodes.length * 94 + 24)
      : (value.height ?? 320);
    const origin = igGetCursorScreenPos();
    const draw = igGetWindowDrawList();
    if (!draw) throw new Error("Cannot access the diagram canvas");
    const boxWidth = narrow
        ? Math.min(180, width - 24)
        : Math.min(180, width / 3.5),
      boxHeight = 66;
    const columns = Math.min(3, value.nodes.length),
      rows = Math.ceil(value.nodes.length / columns);
    const positions = value.nodes.map((node, i) => ({
      x: narrow
        ? origin.x + width / 2
        : origin.x +
          boxWidth / 2 +
          (node.x ?? ((i % columns) + 0.5) / columns) * (width - boxWidth),
      y: narrow
        ? origin.y + boxHeight / 2 + 12 + i * 94
        : origin.y +
          boxHeight / 2 +
          (node.y ?? (Math.floor(i / columns) + 0.5) / rows) *
            (height - boxHeight),
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
