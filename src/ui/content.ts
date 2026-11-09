import {
  ImAxis_Y1,
  ImDrawList_AddCircleFilled,
  ImDrawList_AddLine,
  ImDrawList_AddRect,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
  ImGuiCol_PlotHistogram,
  ImGuiCond_Always,
  ImGuiHoveredFlags_AllowWhenBlockedByActiveItem,
  ImGuiMod_Shift,
  ImGuiStyleVar_CellPadding,
  ImGuiStyleVar_DisabledAlpha,
  ImGuiTableBgTarget_CellBg,
  ImGuiTableColumnFlags_IsSorted,
  ImGuiTableColumnFlags_WidthFixed,
  ImGuiTableColumnFlags_WidthStretch,
  ImGuiTableFlags_BordersInnerH,
  ImGuiTableFlags_PadOuterX,
  ImGuiTableFlags_RowBg,
  ImGuiTableFlags_SizingStretchSame,
  ImGuiTableFlags_Sortable,
  ImGuiTableFlags_SortMulti,
  ImGuiTableFlags_SortTristate,
  ImGuiTableRowFlags_Headers,
  ImGuiTreeNodeFlags_DefaultOpen,
  ImPlot_BeginPlot,
  ImPlot_EndPlot,
  ImPlot_GetPlotLimits,
  ImPlot_GetPlotMousePos,
  ImPlot_GetPlotPos,
  ImPlot_GetPlotSize,
  ImPlot_IsItemHidden,
  ImPlot_IsPlotHovered,
  ImPlot_PixelsToPlot_Vec2,
  ImPlot_PlotToPixels_double,
  ImPlot_PopPlotClipRect,
  ImPlot_PushPlotClipRect,
  ImPlot_SetNextAxesLimits,
  ImPlot_SetupAxes,
  ImPlot_SetupAxisTicks_doublePtr,
  ImPlot_SetupLegend,
  ImPlotAxisFlags_Invert,
  ImPlotAxisFlags_NoGridLines,
  ImPlotAxisFlags_NoTickMarks,
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
  type ImPlotRect_c,
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
  igGetCursorPosY,
  igGetCursorScreenPos,
  igGetFontSize,
  igGetFrameHeight,
  igGetItemRectMax,
  igGetItemRectMin,
  igGetMouseDragDelta,
  igGetMousePos,
  igGetScrollMaxY,
  igGetScrollY,
  igGetWindowHeight,
  igIndent,
  igInputDouble,
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
  igPushStyleVar_Float,
  igPushStyleVar_Vec2,
  igSelectable_Bool,
  igSeparator,
  igSetCursorScreenPos,
  igSetNextItemOpen,
  igSetNextItemWidth,
  igSetScrollY_Float,
  igSetWindowFocus_Nil,
  igSmallButton,
  igSpacing,
  igTableGetColumnFlags,
  igTableGetSortSpecs,
  igTableHeader,
  igTableNextColumn,
  igTableNextRow,
  igTableSetBgColor,
  igTableSetColumnSortDirection,
  igTableSetupColumn,
  igUnindent,
  type PVImage,
  pv_image_destroy,
  pv_image_draw,
  pv_image_load,
  pv_image_size,
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
import { DocumentOutline, type OutlineHeading } from "../outline.ts";
import { barAt, type PlotSeries } from "./chart-hit.ts";
import {
  analyticalRange,
  type ChartBounds,
  chartBounds,
  chartTicks,
  crowdedCategories,
} from "./chart-layout.ts";
import { Diagrams } from "./diagrams.ts";
import { plotDrawList, windowDrawList } from "./draw-list.ts";
import { type Icon, iconButton } from "./icons.ts";
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
  captureText,
  input,
  inputBuffer,
  inputValue,
  overlay,
  panel,
  scalar,
  text,
  tooltip,
} from "./primitives.ts";
import { RichText } from "./richtext.ts";
import { TextSelection, withTextSelection } from "./selection.ts";
import { boxplot, histogram, waterfall } from "./statistics.ts";
import { textLine } from "./text-layout.ts";
import {
  type Color,
  color,
  currentTheme,
  type Font,
  fonts,
  framePadding,
  packed,
  palette,
  seriesColors,
} from "./theme.ts";

export interface DocumentState {
  tables: Record<
    string,
    {
      query: string;
      sort?: { column: number; direction: number }[];
      narrow?: boolean;
    }
  >;
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
interface PlotView {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Labels every `stride`th round value of an axis, matching HTML exports. */
function roundTicks(
  axis: number,
  min: number,
  max: number,
  integer: boolean,
  stride = 1,
) {
  const values = chartTicks(min, max, integer).filter(
    (_, i) => i % stride === 0,
  );
  if (values.length)
    ImPlot_SetupAxisTicks_doublePtr(
      axis,
      values,
      values.map((value) => formatNumber(Number(value.toPrecision(4)))),
      false,
    );
}

/** Draws one line of text centred in the remaining width, as in HTML tables. */
function centered(value: string, size: number, font: Font, tint?: Color) {
  const face = fonts[font];
  if (!face) throw new Error("Fonts are not initialized");
  igPushFont(face, size);
  const width = igCalcTextSize(value, false, -1).x;
  igPopFont();
  const at = igGetCursorScreenPos();
  igSetCursorScreenPos({
    x: at.x + Math.max(0, (available() - width) / 2),
    y: at.y,
  });
  text(value, size, font, tint);
}

/** Records the text a framed widget shows so PDF exports keep it searchable. */
function captureField(value: string, inset = framePadding.x) {
  if (!value || !currentCapture()) return;
  const min = igGetItemRectMin();
  captureText(
    value,
    "regular",
    igGetFontSize(),
    { x: min.x + inset, y: min.y + framePadding.y },
    igCalcTextSize(value, false, -1).x,
  );
}

function tone(value: Tone | undefined): Color {
  return value && value !== "neutral" ? palette[value] : palette.muted;
}
type TableBlock = Extract<Block, { type: "table" }>;
type ChartBlock = Extract<Block, { type: "chart" }>;

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
  private pinchScale = 1;
  private fitRequests = new Set<string>();
  private pinchViews = new Map<
    string,
    { xMin: number; xMax: number; yMin: number; yMax: number }
  >();
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
  private barPress:
    | { key: string; revision: number; value?: Cell; clear: boolean }
    | undefined;
  private rich: RichText;
  private diagrams = new Diagrams();
  private distributions = new Map<
    Block,
    {
      chart?: ChartBlock;
      histogram?: ReturnType<typeof histogram>;
      boxes?: ReturnType<typeof boxplot>[];
      waterfall?: ReturnType<typeof waterfall>;
    }
  >();
  private selection = new TextSelection();
  private view: ResolvedView | undefined;
  private viewRevision = -1;
  private rowDepth = 0;
  private rowDetail = false;
  private chartBounds = new Map<ChartBlock, ChartBounds>();
  private chartLimits = new Map<string, PlotView>();
  private controlChoices = new Map<
    string,
    { values: Cell[]; labels: string[] }
  >();
  private controlInputs = new Map<string, Int8Array>();
  private readonly header: boolean;
  private outlineIndex: DocumentOutline | undefined;
  private headingPositions = new Map<string, number>();
  private headingTarget: string | undefined;
  private headingOffset: number | undefined;
  private currentHeading: string | undefined;
  private viewportScroll = 0;
  private chosenHeading:
    | { id: string; scroll: number; settling: number }
    | undefined;
  private revealedDetails = new Set<string>();
  constructor(
    document: Artifact,
    state: DocumentState = documentState(document),
    options: { header?: boolean } = {},
  ) {
    this.document = document;
    this.state = state;
    this.header = options.header ?? true;
    this.rich = new RichText(
      (asset, width) => this.image(asset, width),
      (key, token) => this.markHeading(this.outlineIndex?.token(key, token)),
    );
  }
  private index(): DocumentOutline {
    if (!this.outlineIndex)
      this.outlineIndex = new DocumentOutline(this.document, (source) =>
        this.rich.tokens(source),
      );
    return this.outlineIndex;
  }
  outline(): OutlineHeading[] {
    return this.index().headings;
  }
  searchSections(query: string): OutlineHeading[] {
    return this.index().search(query);
  }
  navigate(id: string) {
    const index = this.index();
    if (!index.find(id)) throw new Error(`Unknown report section: ${id}`);
    this.headingTarget = id;
    this.headingOffset = undefined;
    this.revealedDetails = new Set(index.reveal(id));
  }
  preserveViewport() {
    const id = this.currentHeading;
    const position = id ? this.headingPositions.get(id) : undefined;
    if (id && position !== undefined) {
      this.headingTarget = id;
      this.headingOffset = this.viewportScroll - position;
      this.revealedDetails = new Set(this.index().reveal(id));
    }
  }
  activeHeading(): string | undefined {
    return this.currentHeading;
  }
  private updateActiveHeading() {
    let active = this.outlineIndex?.headings[0]?.id;
    let nearest = -Infinity;
    const scroll = igGetScrollY();
    this.viewportScroll = scroll;
    const choice = this.chosenHeading;
    if (choice) {
      const position = this.headingPositions.get(choice.id);
      if (
        choice.settling > 0 ||
        (Math.abs(scroll - choice.scroll) < 0.5 &&
          position !== undefined &&
          position >= scroll &&
          position < scroll + igGetWindowHeight())
      ) {
        choice.scroll = scroll;
        if (choice.settling > 0) choice.settling--;
        this.currentHeading = choice.id;
        return;
      }
      this.chosenHeading = undefined;
    }
    const atEnd = scroll > 0 && scroll >= igGetScrollMaxY() - 1;
    const top = scroll + (atEnd ? igGetWindowHeight() : 20);
    for (const [id, position] of this.headingPositions)
      if (position <= top && position > nearest) {
        active = id;
        nearest = position;
      }
    this.currentHeading = active;
  }
  private markHeading(heading: OutlineHeading | undefined) {
    if (!heading) return;
    const top = igGetCursorPosY();
    this.headingPositions.set(heading.id, top);
    if (this.headingTarget === heading.id) {
      const target =
        this.headingOffset === undefined
          ? heading.id === "document"
            ? 0
            : top - 12
          : top + this.headingOffset;
      igSetScrollY_Float(Math.max(0, target));
      igSetWindowFocus_Nil();
      this.chosenHeading = {
        id: heading.id,
        scroll: igGetScrollY(),
        settling: 2,
      };
      this.headingTarget = undefined;
      this.headingOffset = undefined;
    }
  }
  dispose() {
    for (const image of this.images.values()) pv_image_destroy(image);
    this.images.clear();
    this.plots.clear();
    this.plotDrawing.dispose();
    this.pinchViews.clear();
    this.fitRequests.clear();
    this.categoryLayouts.clear();
    this.orders.clear();
    this.searches.clear();
    this.tableCells.clear();
    this.cellWidths.clear();
    this.chartBounds.clear();
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
    const draw = windowDrawList();
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
  body(exporting: boolean, pinchScale = 1) {
    this.pinchScale = exporting ? 1 : pinchScale;
    if (!exporting) this.headingPositions.clear();
    if (exporting) this.renderBody(true);
    else withTextSelection(this.selection, () => this.renderBody(false));
    if (!exporting && this.outlineIndex) this.updateActiveHeading();
    if (!this.headingTarget) this.revealedDetails.clear();
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
      this.chartBounds.clear();
      this.distributions.clear();
      this.pinchViews.clear();
      this.fitRequests.clear();
    }
    if (this.header) {
      if (!exporting) this.markHeading(this.outlineIndex?.block("document"));
      const headerTop = igGetCursorScreenPos().y;
      text(
        `PROJECT VISUALIZE  /  ${(this.document.category ?? this.document.type ?? "artifact").toUpperCase()}`,
        12,
        "bold",
        palette.accent,
      );
      text(this.document.title, available() < 480 ? 30 : 38, "bold");
      if (this.document.subtitle)
        text(this.document.subtitle, 19, "regular", palette.muted);
      igSpacing();
      igSeparator();
      igSpacing();
      keepTogether(headerTop, igGetCursorScreenPos().y);
    }
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
    const flow =
      ["column", "details", "card", "timeline"].includes(value.type) ||
      (value.type === "row" && available() < 620);
    let heading = parentHeading;
    const capture = currentCapture();
    let bodyLineStart: number | undefined;
    if (value.title && !["callout", "details", "card"].includes(value.type)) {
      if (!exporting) this.markHeading(this.outlineIndex?.block(key));
      heading = captureHeading(value.title, top, parentHeading);
      text(value.title, 22, "bold");
      bodyLineStart = capture?.lines.length;
    }
    switch (value.type) {
      case "markdown":
        this.rich.markdown(value.content, exporting, heading, key);
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
          text(
            display,
            36,
            "bold",
            value.tone && value.tone !== "neutral"
              ? tone(value.tone)
              : palette.ink,
          );
          if (value.detail || this.rowDetail)
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
        const draw = windowDrawList();
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
        this.timeline(value, exporting, key, heading);
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
            this.rowDepth++;
            // Metrics beside one with a detail keep its line so the cards align.
            const rowDetail = this.rowDetail;
            this.rowDetail = value.children.some(
              (child) => child.type === "metric" && !!child.detail,
            );
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
            this.rowDepth--;
            this.rowDetail = rowDetail;
            igEndTable();
          }
          igPopStyleVar(1);
        }
        break;
      case "card":
        panel(() => {
          if (value.title) {
            if (!exporting) this.markHeading(this.outlineIndex?.block(key));
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
              if (!exporting) this.markHeading(this.outlineIndex?.block(key));
              heading = captureHeading(
                value.title,
                igGetCursorScreenPos().y,
                parentHeading,
              );
              text(value.title, 21, "bold", tone(value.tone ?? "positive"));
              bodyLineStart = capture?.lines.length;
            }
            this.rich.markdown(value.content, exporting, heading, key);
          },
          { ...tone(value.tone ?? "positive"), w: 0.08 },
        );
        break;
      case "details":
        if (!exporting) {
          if (this.revealedDetails.has(key))
            igSetNextItemOpen(true, ImGuiCond_Always);
          this.markHeading(this.outlineIndex?.block(key));
        }
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
        this.diagrams.draw(value, exporting);
        break;
      case "histogram":
      case "boxplot":
      case "waterfall":
        this.analytical(value, exporting, key);
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
      if (!flow)
        keepTogether(
          top,
          bottom,
          [
            "diagram",
            "chart",
            "image",
            "heatmap",
            "histogram",
            "boxplot",
            "waterfall",
          ].includes(value.type)
            ? value.type === "diagram"
              ? "diagram"
              : "figure"
            : undefined,
        );
      keepTogether(top, Math.min(top + 48, bottom));
      keepTogether(Math.max(top, bottom - 48), bottom);
    }
  }
  private timeline(
    value: Extract<Block, { type: "timeline" }>,
    exporting: boolean,
    key: string,
    heading?: number,
  ) {
    const origin = igGetCursorScreenPos(),
      draw = windowDrawList();
    const points: { y: number; tint: Color }[] = [];
    igIndent(32);
    for (const [index, event] of value.events.entries()) {
      igPushID_Int(index);
      const top = igGetCursorScreenPos().y;
      points.push({ y: top + 9, tint: tone(event.tone ?? "positive") });
      if (event.label) text(event.label, 12, "bold", palette.muted);
      if (!exporting)
        this.markHeading(this.outlineIndex?.block(`${key}.events.${index}`));
      text(event.title, 20, "bold");
      if (event.content)
        this.rich.markdown(
          event.content,
          exporting,
          heading,
          `${key}.events.${index}`,
        );
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
    // Exports draw the viewer's own widgets, inert but not dimmed, so a
    // capture shows the controls as they appear on screen.
    if (exporting) {
      igPushStyleVar_Float(ImGuiStyleVar_DisabledAlpha, 1);
      igBeginDisabled(true);
    }
    try {
      this.controlWidgets(control, current, options, preview);
    } finally {
      if (exporting) {
        igEndDisabled();
        igPopStyleVar(1);
      }
    }
  }
  private controlWidgets(
    control: ControlBlock,
    current: ParameterValue,
    options: { values: Cell[]; labels: string[] },
    preview: string,
  ) {
    const face = fonts.bold;
    if (!face) throw new Error("Fonts are not initialized");
    igPushFont(face, 12);
    const labelSize = igCalcTextSize(control.label, false, -1);
    igPopFont();
    if (control.kind === "toggle") {
      // Line the checkbox up with the fields of neighbouring controls.
      if (this.rowDepth) igDummy({ x: 0, y: labelSize.y });
      const result = igCheckbox(control.label, current === true);
      captureField(control.label, igGetFrameHeight() + 6);
      if (result.result) this.parameter(control, result.v);
      return;
    }
    // Draw the label at the cell's top: ImGui would offset text in later row
    // columns to the baseline of a framed widget in an earlier column.
    const at = igGetCursorScreenPos();
    ImDrawList_AddText_FontPtr(
      windowDrawList(),
      face,
      12,
      at,
      packed(palette.muted),
      control.label,
      0,
    );
    captureText(control.label, "bold", 12, at, labelSize.x);
    igDummy(labelSize);
    igSetNextItemWidth(-1);
    if (control.kind === "select") {
      const open = igBeginCombo("##value", preview, 0);
      captureField(preview);
      if (open) {
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
      captureField(inputValue(buffer));
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
      text("Minimum", 13, "regular", palette.muted);
      igSetNextItemWidth(-1);
      const lower = igInputDouble("##minimum", min, 0, 0, "%.15g", 0);
      captureField(String(min));
      if (lower.result && Number.isFinite(lower.v) && lower.v <= max) {
        min = lower.v;
        this.parameter(control, { min, max });
      }
      text("Maximum", 13, "regular", palette.muted);
      igSetNextItemWidth(-1);
      const upper = igInputDouble("##maximum", max, 0, 0, "%.15g", 0);
      captureField(String(max));
      if (upper.result && Number.isFinite(upper.v) && upper.v >= min) {
        max = upper.v;
        this.parameter(control, { min, max });
      }
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
    const narrow = value.columns.length > 2 && available() < 480;
    let sort = exporting ? [] : (state.sort ?? []);
    if (narrow && !exporting) {
      const active = sort[0];
      const preview = active
        ? `${value.columns[active.column].label} · ${active.direction === 1 ? "ascending" : "descending"}`
        : "Source order";
      text("Sort rows", 12, "bold", palette.muted);
      igSetNextItemWidth(Math.min(300, available()));
      if (igBeginCombo("##sort", preview, 0)) {
        if (igSelectable_Bool("Source order", !sort.length, 0, { x: 0, y: 0 }))
          sort = [];
        for (let i = 0; i < value.columns.length; i++)
          for (const direction of [1, 2])
            if (
              igSelectable_Bool(
                `${value.columns[i].label} · ${direction === 1 ? "ascending" : "descending"}##${i}-${direction}`,
                active?.column === i && active.direction === direction,
                0,
                { x: 0, y: 0 },
              )
            )
              sort = [{ column: i, direction }];
        igEndCombo();
      }
    }
    const capture = currentCapture();
    const textStart = capture?.text.length ?? 0;
    let textEnd = textStart;
    const rowStarts: number[] = [];
    const tableTop = igGetCursorScreenPos().y;
    let open = false;
    if (!narrow) {
      igPushStyleVar_Vec2(ImGuiStyleVar_CellPadding, { x: 12, y: 10 });
      let flags =
        ImGuiTableFlags_BordersInnerH |
        ImGuiTableFlags_RowBg |
        ImGuiTableFlags_SizingStretchSame |
        ImGuiTableFlags_PadOuterX;
      if (!exporting)
        flags |=
          ImGuiTableFlags_Sortable |
          ImGuiTableFlags_SortMulti |
          ImGuiTableFlags_SortTristate;
      open = igBeginTable(
        "data",
        value.columns.length,
        flags,
        { x: 0, y: 0 },
        0,
      );
      if (open) {
        for (const column of value.columns)
          igTableSetupColumn(
            column.label,
            ImGuiTableColumnFlags_WidthStretch,
            column.weight ?? 1,
            0,
          );
        if (!exporting && state.narrow) {
          igTableSetColumnSortDirection(0, 0, false);
          for (let i = 0; i < sort.length; i++)
            igTableSetColumnSortDirection(
              sort[i].column,
              sort[i].direction,
              i > 0,
            );
        }
        igTableNextRow(ImGuiTableRowFlags_Headers, 0);
        const face = fonts.bold;
        if (!face) throw new Error("Fonts are not initialized");
        igPushFont(face, 16);
        for (const [i, column] of value.columns.entries()) {
          igTableNextColumn();
          const at = igGetCursorScreenPos();
          const indent = cells.right[i]
            ? Math.max(
                0,
                available() - igCalcTextSize(column.label, false, -1).x,
              )
            : 0;
          if (exporting) {
            igSetCursorScreenPos({ x: at.x + indent, y: at.y });
            text(column.label, 16, "bold");
          } else if (!indent) igTableHeader(column.label);
          else {
            // ImGui headers only align left, so draw a right-aligned label
            // and step it clear of the sort arrow ImGui adds at the edge.
            igTableHeader(`##header-${i}`);
            const sorted =
              (igTableGetColumnFlags(i) & ImGuiTableColumnFlags_IsSorted) !== 0;
            ImDrawList_AddText_FontPtr(
              windowDrawList(),
              face,
              16,
              { x: at.x + Math.max(0, indent - (sorted ? 22 : 0)), y: at.y },
              packed(palette.ink),
              column.label,
              0,
            );
          }
        }
        igPopFont();
        textEnd = capture?.text.length ?? 0;
        if (!exporting) {
          sort = [];
          const specs = igTableGetSortSpecs()?.Specs ?? [];
          for (const spec of specs)
            sort.push({
              column: spec.ColumnIndex,
              direction: spec.SortDirection,
            });
        }
      }
    }
    if (!exporting) {
      state.sort = sort;
      state.narrow = narrow;
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
    const empty = cached.indices.length
      ? undefined
      : rows.length
        ? "search"
        : "view";
    for (const index of cached.indices) {
      if (narrow) {
        const top = igGetCursorScreenPos().y;
        for (let column = 0; column < value.columns.length; column++) {
          text(value.columns[column].label, 12, "bold", palette.muted);
          text(cells.values[index][column], 16);
        }
        keepTogether(top, igGetCursorScreenPos().y);
        igSeparator();
        igSpacing();
      } else if (open) {
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
    }
    if (!narrow) {
      if (open) {
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
      igPopStyleVar(1);
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
          centered(xLabels[column], 14, "bold");
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
            centered(
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
        draw = windowDrawList();
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
    const reset = this.fitRequests.delete(interactionKey);
    const fitKey = this.view?.chartFitKeys.get(key) ?? "";
    const refit = this.state.chartFits.get(interactionKey) !== fitKey;
    const pinch = this.pinchViews.get(interactionKey);
    this.pinchViews.delete(interactionKey);
    let bounds = this.chartBounds.get(value);
    if (!bounds) {
      bounds = chartBounds(
        series.flatMap((item) =>
          item.values.map((y, i) => ({ x: item.x?.[i] ?? i, y })),
        ),
        value.kind,
      );
      this.chartBounds.set(value, bounds);
    }
    const fitted = horizontalBars
      ? {
          xMin: bounds.ymin,
          xMax: bounds.ymax,
          yMin: bounds.xmin,
          yMax: bounds.xmax,
        }
      : {
          xMin: bounds.xmin,
          xMax: bounds.xmax,
          yMin: bounds.ymin,
          yMax: bounds.ymax,
        };
    const next = exporting || refit || reset ? fitted : pinch;
    if (next)
      ImPlot_SetNextAxesLimits(
        next.xMin,
        next.xMax,
        next.yMin,
        next.yMax,
        ImGuiCond_Always,
      );
    // Ticks follow the view of the previous frame, which pan and zoom change.
    const limits = next ?? this.chartLimits.get(interactionKey) ?? fitted;
    if (reset) this.barPress = undefined;
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
    if (refit) this.state.chartFits.set(interactionKey, fitKey);
    // Like HTML exports, only the value axis carries gridlines.
    ImPlot_SetupAxes(
      horizontalBars ? (value.yLabel ?? "") : (value.xLabel ?? ""),
      horizontalBars ? (value.xLabel ?? "") : (value.yLabel ?? ""),
      ImPlotAxisFlags_NoTickMarks |
        (horizontalBars ? 0 : ImPlotAxisFlags_NoGridLines),
      ImPlotAxisFlags_NoTickMarks |
        (horizontalBars
          ? ImPlotAxisFlags_Invert | ImPlotAxisFlags_NoGridLines
          : 0),
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
          ImPlot_SetupAxisTicks_doublePtr(
            horizontalBars ? ImAxis_Y1 : 0,
            [i],
            [categories?.labels[i] ?? value.labels[i]],
            false,
          );
    roundTicks(
      horizontalBars ? 0 : ImAxis_Y1,
      horizontalBars ? limits.xMin : limits.yMin,
      horizontalBars ? limits.xMax : limits.yMax,
      bounds.yWhole,
    );
    if (!value.labels) {
      const values = chartTicks(limits.xMin, limits.xMax, bounds.xWhole);
      const stride = Math.max(
        1,
        Math.ceil(
          values.length / Math.max(1, Math.floor((available() - 80) / 80)),
        ),
      );
      roundTicks(0, limits.xMin, limits.xMax, bounds.xWhole, stride);
    }
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
      const draw = plotDrawList();
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
      if (hovered && Math.abs(this.pinchScale - 1) > 0.00001) {
        const position = ImPlot_GetPlotPos(),
          size = ImPlot_GetPlotSize(),
          pointer = igGetMousePos();
        const corner = (x: number, y: number) =>
          ImPlot_PixelsToPlot_Vec2(
            {
              x: pointer.x + (x - pointer.x) / this.pinchScale,
              y: pointer.y + (y - pointer.y) / this.pinchScale,
            },
            -1,
            -1,
          );
        const a = corner(position.x, position.y),
          b = corner(position.x + size.x, position.y + size.y);
        const next = {
          xMin: Math.min(a.x, b.x),
          xMax: Math.max(a.x, b.x),
          yMin: Math.min(a.y, b.y),
          yMax: Math.max(a.y, b.y),
        };
        if (Object.values(next).every(Number.isFinite))
          this.pinchViews.set(interactionKey, next);
        this.barPress = undefined;
      }
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
            clear: false,
          };
        const plotPosition = ImPlot_GetPlotPos(),
          plotSize = ImPlot_GetPlotSize();
        const pointer = igGetMousePos();
        const overZoom =
          pointer.x >= plotPosition.x + plotSize.x - 96 &&
          pointer.y <= plotPosition.y + 42;
        const outside = category === undefined || category !== selectedIndex;
        if (
          hovered &&
          !shift &&
          !isAll(selected) &&
          outside &&
          !overZoom &&
          igIsMouseClicked_Bool(0, false)
        )
          this.barPress = {
            key: interactionKey,
            revision: this.viewRevision,
            clear: true,
          };
        if (this.barPress?.key === interactionKey && igIsMouseReleased_Nil(0)) {
          const press = this.barPress;
          const delta = igGetMouseDragDelta(0, 0);
          // Include release-frame movement; native drag history also catches an out-and-back drag.
          const dragged =
            igIsMouseDragPastThreshold(0, -1) ||
            Math.hypot(delta.x, delta.y) > 6;
          if (
            !dragged &&
            press.revision === this.state.revision &&
            hovered &&
            (press.clear
              ? !shift && outside && !overZoom
              : shift &&
                category !== undefined &&
                press.value === selection.values[category])
          ) {
            const control = controls(this.document).find(
              (control) => control.id === selection.control,
            );
            if (control)
              this.parameter(
                control,
                press.clear ||
                  parameterValue(this.state.parameters, control.id) ===
                    press.value
                  ? ALL
                  : (press.value ?? null),
              );
          }
          this.barPress = undefined;
        }
      }
      if (hovered) {
        const rows: { label: string; value: string; color: Color }[] = [];
        let title: string | undefined;
        const coordinates: string[] = [];
        if (selection && category !== undefined) {
          title =
            value.labels?.[category] ?? scalar(selection.values[category]);
          for (let i = 0; i < series.length; i++) {
            if (hidden[i]) continue;
            const j = series[i].x?.indexOf(category) ?? -1;
            if (j >= 0)
              rows.push({
                label: series[i].name,
                value: formatNumber(series[i].values[j]),
                color: seriesColors[i % seriesColors.length],
              });
          }
        } else if (!selection) {
          for (let i = 0; i < series.length; i++) {
            if (hidden[i]) continue;
            let nearest = 0;
            const { x, y } = data[i];
            for (let j = 1; j < x.length; j++)
              if (Math.abs(x[j] - mouse.x) < Math.abs(x[nearest] - mouse.x))
                nearest = j;
            const coordinate =
              value.labels?.[series[i].x?.[nearest] ?? nearest] ??
              `${value.xLabel ? `${value.xLabel}: ` : ""}${formatNumber(series[i].x?.[nearest] ?? nearest)}`;
            title ??= coordinate;
            coordinates.push(coordinate);
            rows.push({
              label: series[i].name,
              value: formatNumber(y[nearest]),
              color: seriesColors[i % seriesColors.length],
            });
          }
        }
        if (new Set(coordinates).size > 1) {
          title = "Nearest observations";
          for (let i = 0; i < rows.length; i++)
            rows[i].label += ` · ${coordinates[i]}`;
        }
        if (rows.length)
          tooltip({
            title,
            subtitle: value.yLabel,
            rows,
            shortcut: selection
              ? "Shift-click to select · click outside to clear"
              : undefined,
          });
      }
    }

    const area = exporting
      ? undefined
      : {
          position: ImPlot_GetPlotPos(),
          size: ImPlot_GetPlotSize(),
          limits: ImPlot_GetPlotLimits(-1, -1),
        };
    const view = ImPlot_GetPlotLimits(-1, -1);
    this.chartLimits.set(interactionKey, {
      xMin: view.X.Min,
      xMax: view.X.Max,
      yMin: view.Y.Min,
      yMax: view.Y.Max,
    });
    ImPlot_EndPlot();
    if (area) overlay(() => this.zoomControls(interactionKey, area));
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
  }

  private zoomControls(
    key: string,
    area: {
      position: { x: number; y: number };
      size: { x: number; y: number };
      limits: ImPlotRect_c;
    },
  ) {
    const { position, size, limits } = area;
    if (
      !igIsWindowHovered(ImGuiHoveredFlags_AllowWhenBlockedByActiveItem) ||
      !igIsMouseHoveringRect(
        position,
        { x: position.x + size.x, y: position.y + size.y },
        true,
      )
    )
      return;
    const button = 26,
      inset = 3,
      width = button * 3 + inset * 2,
      origin = {
        x: position.x + size.x - width - 8,
        y: position.y + 8,
      };
    if (origin.x < position.x || size.y < button + inset * 2 + 16) return;
    const draw = windowDrawList();
    const end = { x: origin.x + width, y: origin.y + button + inset * 2 };
    ImDrawList_AddRectFilled(draw, origin, end, packed(palette.surface), 9, 0);
    ImDrawList_AddRect(draw, origin, end, packed(palette.border), 9, 1, 0);
    const zoom = (factor: number) => {
      const x = (limits.X.Min + limits.X.Max) / 2,
        y = (limits.Y.Min + limits.Y.Max) / 2,
        halfX = ((limits.X.Max - limits.X.Min) * factor) / 2,
        halfY = ((limits.Y.Max - limits.Y.Min) * factor) / 2;
      this.pinchViews.set(key, {
        xMin: x - halfX,
        xMax: x + halfX,
        yMin: y - halfY,
        yMax: y + halfY,
      });
      this.barPress = undefined;
    };
    const modifier = process.platform === "darwin" ? "Cmd" : "Ctrl";
    const actions: [Icon, string, () => void][] = [
      ["plus", `Zoom in · pinch or ${modifier}+scroll`, () => zoom(0.75)],
      ["minus", "Zoom out", () => zoom(1 / 0.75)],
      [
        "fit",
        "Fit to data · double-click the chart",
        () => this.fitRequests.add(key),
      ],
    ];
    for (const [index, [icon, hint, action]] of actions.entries()) {
      igSetCursorScreenPos({
        x: origin.x + inset + index * button,
        y: origin.y + inset,
      });
      if (iconButton(`##zoom-${icon}`, icon, hint, { size: button })) action();
    }
  }

  private analytical(
    value: Extract<Block, { type: "histogram" | "boxplot" | "waterfall" }>,
    exporting: boolean,
    key: string,
  ) {
    let prepared = this.distributions.get(value);
    const fresh = !prepared;
    if (!prepared) {
      prepared =
        value.type === "waterfall"
          ? { waterfall: waterfall(value.steps) }
          : value.type === "histogram"
            ? {
                histogram: histogram(
                  (value.series ?? []).map((series) => series.values),
                  value.bins,
                ),
              }
            : {
                boxes: (value.series ?? []).map((series) =>
                  boxplot(series.values),
                ),
              };
      this.distributions.set(value, prepared);
    }
    if (value.type === "histogram") {
      const result = prepared.histogram;
      if (!result?.boundaries.length) {
        text("No observations in this view.", 16, "regular", palette.muted);
        return;
      }
      const bins = result.counts[0]?.length ?? 0;
      const label = (v: number) => formatNumber(Number(v.toPrecision(4)));
      prepared.chart ??= {
        ...value,
        type: "chart",
        kind: "bar",
        source: undefined,
        xLabel: value.xLabel ?? "Observation range",
        yLabel: value.yLabel ?? "Count",
        labels: Array.from(
          { length: bins },
          (_, i) =>
            `${label(result.boundaries[i])}–${label(result.boundaries[i + 1])}`,
        ),
        series: (value.series ?? []).map((series, i) => ({
          name: series.name,
          values: result.counts[i],
        })),
      };
      this.chart(prepared.chart, exporting, key);
      return;
    }
    if (value.type === "boxplot" && !prepared.boxes?.some(Boolean)) {
      text("No observations in this view.", 16, "regular", palette.muted);
      return;
    }
    const reset = this.fitRequests.delete(key),
      pinch = this.pinchViews.get(key);
    this.pinchViews.delete(key);
    const range = analyticalRange(
      value.type === "waterfall"
        ? [prepared.waterfall?.low ?? 0, prepared.waterfall?.high ?? 1]
        : (value.series ?? []).flatMap((series) => series.values),
      value.type === "waterfall",
    );
    const fitted = {
      xMin: -0.5,
      xMax:
        (value.type === "waterfall"
          ? value.steps.length
          : (value.series ?? []).length) - 0.5,
      yMin: range.low,
      yMax: range.high,
    };
    const next = exporting || fresh || reset ? fitted : pinch;
    if (next)
      ImPlot_SetNextAxesLimits(
        next.xMin,
        next.xMax,
        next.yMin,
        next.yMax,
        ImGuiCond_Always,
      );
    const limits = next ?? this.chartLimits.get(key) ?? fitted;
    if (
      !ImPlot_BeginPlot(
        "##analysis",
        { x: -1, y: value.height ?? 300 },
        ImPlotFlags_NoTitle |
          ImPlotFlags_NoMenus |
          (exporting ? ImPlotFlags_NoInputs : 0),
      )
    )
      return;
    ImPlot_SetupAxes(
      "",
      value.yLabel ?? "",
      ImPlotAxisFlags_NoTickMarks | ImPlotAxisFlags_NoGridLines,
      ImPlotAxisFlags_NoTickMarks,
    );
    roundTicks(
      ImAxis_Y1,
      limits.yMin,
      limits.yMax,
      value.type === "boxplot" &&
        (value.series ?? []).every((series) =>
          series.values.every(Number.isInteger),
        ),
    );
    ImPlot_SetupLegend(
      ImPlotLocation_South,
      ImPlotLegendFlags_Horizontal |
        ImPlotLegendFlags_Outside |
        ImPlotLegendFlags_NoMenus,
    );
    if (value.type === "boxplot") {
      for (const [i, series] of (value.series ?? []).entries())
        ImPlot_SetupAxisTicks_doublePtr(0, [i], [series.name], false);
      for (const [i, series] of (value.series ?? []).entries()) {
        const summary = prepared.boxes?.[i];
        if (summary)
          this.plotDrawing.box(
            series.name,
            i,
            summary,
            seriesColors[i % seriesColors.length],
          );
      }
    } else {
      for (const [i, step] of value.steps.entries())
        ImPlot_SetupAxisTicks_doublePtr(0, [i], [step.label], false);
      this.plotDrawing.waterfall(prepared.waterfall ?? waterfall([]), {
        increase: palette.positive,
        decrease: palette.negative,
        total: palette.accent,
      });
    }
    if (!exporting && ImPlot_IsPlotHovered()) {
      const mouse = ImPlot_GetPlotMousePos(-1, -1),
        index = Math.round(mouse.x);
      if (value.type === "boxplot") {
        const summary = prepared.boxes?.[index],
          series = value.series?.[index];
        if (summary && series)
          tooltip({
            title: series.name,
            rows: [
              { label: "Median", value: formatNumber(summary.median) },
              {
                label: "Middle 50%",
                value: `${formatNumber(summary.q1)} – ${formatNumber(summary.q3)}`,
              },
              {
                label: "Whiskers",
                value: `${formatNumber(summary.low)} – ${formatNumber(summary.high)}`,
              },
              { label: "Observations", value: String(summary.count) },
            ],
          });
      } else {
        const step = value.steps[index],
          total = prepared.waterfall?.bars[index];
        if (step && total)
          tooltip({
            title: step.label,
            rows: [
              {
                label: step.kind === "total" ? "Total" : "Change",
                value: formatNumber(step.value),
              },
              { label: "Running total", value: formatNumber(total.end) },
            ],
          });
      }
      if (Math.abs(this.pinchScale - 1) > 0.00001) {
        const pos = ImPlot_GetPlotPos(),
          size = ImPlot_GetPlotSize(),
          pointer = igGetMousePos();
        const a = ImPlot_PixelsToPlot_Vec2(
          {
            x: pointer.x + (pos.x - pointer.x) / this.pinchScale,
            y: pointer.y + (pos.y - pointer.y) / this.pinchScale,
          },
          -1,
          -1,
        );
        const b = ImPlot_PixelsToPlot_Vec2(
          {
            x: pointer.x + (pos.x + size.x - pointer.x) / this.pinchScale,
            y: pointer.y + (pos.y + size.y - pointer.y) / this.pinchScale,
          },
          -1,
          -1,
        );
        this.pinchViews.set(key, {
          xMin: Math.min(a.x, b.x),
          xMax: Math.max(a.x, b.x),
          yMin: Math.min(a.y, b.y),
          yMax: Math.max(a.y, b.y),
        });
      }
    }
    const area = {
      position: ImPlot_GetPlotPos(),
      size: ImPlot_GetPlotSize(),
      limits: ImPlot_GetPlotLimits(-1, -1),
    };
    this.chartLimits.set(key, {
      xMin: area.limits.X.Min,
      xMax: area.limits.X.Max,
      yMin: area.limits.Y.Min,
      yMax: area.limits.Y.Max,
    });
    ImPlot_EndPlot();
    if (!exporting) overlay(() => this.zoomControls(key, area));
  }
}
