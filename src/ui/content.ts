import {
  ImDrawList_AddLine,
  ImDrawList_AddRect,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
  ImDrawList_AddTriangleFilled,
  ImGuiStyleVar_CellPadding,
  ImGuiTableColumnFlags_WidthStretch,
  ImGuiTableFlags_BordersInnerH,
  ImGuiTableFlags_RowBg,
  ImGuiTableFlags_SizingStretchSame,
  ImGuiTableFlags_Sortable,
  ImGuiTableFlags_SortMulti,
  ImGuiTreeNodeFlags_DefaultOpen,
  ImPlot_BeginPlot,
  ImPlot_EndPlot,
  ImPlot_GetPlotMousePos,
  ImPlot_IsPlotHovered,
  ImPlot_SetNextAxesToFit,
  ImPlot_SetupAxes,
  ImPlotFlags_Crosshairs,
  ImPlotFlags_NoInputs,
  ImPlotFlags_NoMenus,
  ImPlotFlags_NoTitle,
  ImPlotMarker_Circle,
  ImPlotMarker_None,
  igBeginTable,
  igCalcTextSize,
  igCollapsingHeader_TreeNodeFlags,
  igDummy,
  igEndTable,
  igGetCursorScreenPos,
  igGetWindowDrawList,
  igInvisibleButton,
  igIsItemHovered,
  igPopFont,
  igPopID,
  igPopStyleVar,
  igProgressBar,
  igPushFont,
  igPushID_Int,
  igPushID_Str,
  igPushStyleVar_Vec2,
  igSeparator,
  igSetCursorScreenPos,
  igSetNextItemWidth,
  igSpacing,
  igTableHeadersRow,
  igTableNextColumn,
  igTableNextRow,
  igTableSetupColumn,
  type PVImage,
  pv_image_destroy,
  pv_image_draw,
  pv_image_load,
  pv_image_size,
  pv_plot_series,
  pv_plot_tick,
  pv_table_sort,
} from "maligator:ffi/visualize";
import type { Artifact, Block, Tone } from "../model.ts";
import {
  available,
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
}
export function documentState(): DocumentState {
  return { tables: {} };
}
function tone(value: Tone | undefined): Color {
  return value && value !== "neutral" ? palette[value] : palette.muted;
}
function cell(row: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(row, key) ? row[key] : null;
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
  private plots = new Map<ChartBlock, { x: Float64Array; y: Float64Array }[]>();
  private rich: RichText;
  constructor(document: Artifact, state: DocumentState = documentState()) {
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
  body(exporting: boolean) {
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
    this.blocks(this.document.body, exporting, "body");
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
          text(scalar(value.value), 36, "bold");
          if (value.detail) text(value.detail, 15, "regular", tone(value.tone));
        });
        break;
      case "progress":
        text(value.label, 17, "bold");
        igProgressBar(value.value, { x: -1, y: 14 }, "");
        if (value.detail) text(value.detail, 15, "regular", palette.muted);
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
          { ...palette.accent, w: 0.08 },
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
        this.chart(value, exporting);
        break;
      case "diagram":
        this.diagram(value, exporting);
        break;
      case "image":
        this.image(value.asset);
        break;
    }
    if (value.caption) text(value.caption, 15, "regular", palette.muted);
  }
  private table(value: TableBlock, exporting: boolean, key: string) {
    this.state.tables[key] ??= { query: "" };
    const state = this.state.tables[key];
    let buffer = this.searches.get(key);
    if (!buffer) {
      buffer = inputBuffer(state.query);
      this.searches.set(key, buffer);
    }
    if (!exporting && value.rows.length > 5) {
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
    if (igBeginTable("data", value.columns.length, flags, { x: 0, y: 0 }, 0)) {
      for (const column of value.columns)
        igTableSetupColumn(column.label, 0, 0, 0);
      igTableHeadersRow();
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
        const indices = value.rows
          .map((_, i) => i)
          .filter(
            (i) =>
              !query ||
              value.columns
                .map((c) => scalar(cell(value.rows[i], c.key)))
                .join(" ")
                .toLowerCase()
                .includes(query),
          );
        if (sort.length)
          indices.sort((a, b) => {
            for (const spec of sort) {
              const field = value.columns[spec.column].key;
              const x = cell(value.rows[a], field),
                y = cell(value.rows[b], field);
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
        for (const column of value.columns) {
          igTableNextColumn();
          text(scalar(cell(value.rows[index], column.key)), 16);
        }
      }
      igEndTable();
    }
  }
  private chart(value: ChartBlock, exporting: boolean) {
    if (exporting) ImPlot_SetNextAxesToFit();
    let flags = ImPlotFlags_NoTitle | ImPlotFlags_Crosshairs;
    if (exporting) flags |= ImPlotFlags_NoInputs | ImPlotFlags_NoMenus;
    if (!ImPlot_BeginPlot("##chart", { x: -1, y: value.height ?? 300 }, flags))
      return;
    ImPlot_SetupAxes(value.xLabel ?? "", value.yLabel ?? "", 0, 0);
    if (value.labels)
      for (let i = 0; i < value.labels.length; i++)
        pv_plot_tick(0, i, value.labels[i]);
    let data = this.plots.get(value);
    if (!data) {
      data = value.series.map((series, index) => {
        const x = new Float64Array(series.values.length);
        for (let i = 0; i < x.length; i++) x[i] = series.x?.[i] ?? i;
        if (value.kind === "bar") {
          const width = 0.8 / value.series.length;
          for (let i = 0; i < x.length; i++)
            x[i] += (index - (value.series.length - 1) / 2) * width;
        }
        return { x, y: new Float64Array(series.values) };
      });
      this.plots.set(value, data);
    }
    for (let i = 0; i < value.series.length; i++)
      pv_plot_series(
        value.series[i].name,
        data[i].x,
        data[i].y,
        value.kind === "bar" ? 1 : value.kind === "scatter" ? 2 : 0,
        {
          color: seriesColors[i % seriesColors.length],
          line_weight: 2.5,
          marker_size: 4,
          marker:
            value.kind === "scatter" ? ImPlotMarker_Circle : ImPlotMarker_None,
          bar_width: 0.8 / value.series.length,
        },
      );
    if (!exporting && ImPlot_IsPlotHovered()) {
      const mouse = ImPlot_GetPlotMousePos(-1, -1);
      const lines: string[] = [];
      for (let i = 0; i < value.series.length; i++) {
        let nearest = 0;
        const { x, y } = data[i];
        for (let j = 1; j < x.length; j++)
          if (Math.abs(x[j] - mouse.x) < Math.abs(x[nearest] - mouse.x))
            nearest = j;
        lines.push(`${value.series[i].name}: ${y[nearest]}`);
      }
      tooltip(lines.join("\n"));
    }
    ImPlot_EndPlot();
  }
  private diagram(value: DiagramBlock, exporting: boolean) {
    const width = available(),
      height = value.height ?? 320;
    const origin = igGetCursorScreenPos();
    const draw = igGetWindowDrawList();
    if (!draw) throw new Error("Cannot access the diagram canvas");
    const boxWidth = Math.min(180, width / 3.5),
      boxHeight = 66;
    const columns = Math.min(3, value.nodes.length),
      rows = Math.ceil(value.nodes.length / columns);
    const positions = value.nodes.map((node, i) => ({
      x:
        origin.x +
        boxWidth / 2 +
        (node.x ?? ((i % columns) + 0.5) / columns) * (width - boxWidth),
      y:
        origin.y +
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
      }
    }
    for (let i = 0; i < value.nodes.length; i++) {
      const node = value.nodes[i],
        center = positions[i],
        a = { x: center.x - boxWidth / 2, y: center.y - boxHeight / 2 },
        b = { x: center.x + boxWidth / 2, y: center.y + boxHeight / 2 };
      ImDrawList_AddRectFilled(draw, a, b, packed(palette.white), 9, 0);
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
