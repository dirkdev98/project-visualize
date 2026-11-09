import {
  ImDrawList_AddLine,
  ImDrawList_AddQuad,
  ImDrawList_AddQuadFilled,
  ImDrawList_AddRect,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
  ImDrawList_AddTriangleFilled,
  igCalcTextSize,
  igDummy,
  igGetCursorScreenPos,
  igInvisibleButton,
  igPopFont,
  igPopID,
  igPushFont,
  igPushID_Int,
  igSetCursorScreenPos,
} from "maligator:ffi/visualize";
import type { Block } from "../model.ts";
import {
  type Box,
  edgeLabelLayout,
  type GraphLayout,
  graphLayout,
  type Point,
} from "./diagram-layout.ts";
import { windowDrawList } from "./draw-list.ts";
import { keepTogether } from "./layout.ts";
import {
  available,
  captureWrappedText,
  itemTooltip,
  text,
} from "./primitives.ts";
import { type Color, type Font, fonts, packed, palette } from "./theme.ts";

type DiagramBlock = Extract<Block, { type: "diagram" }>;
type Graph = Exclude<DiagramBlock, { kind: "sequence" | "gantt" }>;

export class Diagrams {
  private cache = new Map<
    Graph,
    { width: number; layout: GraphLayout; labels: (Box | undefined)[] }
  >();
  private measure(
    value: string,
    width: number,
    size = 15,
    name: Font = "regular",
  ) {
    const font = fonts[name];
    if (!font) throw new Error("Fonts are not initialized");
    igPushFont(font, size);
    const result = igCalcTextSize(value, false, width);
    igPopFont();
    return result;
  }
  private label(
    value: string,
    point: Point,
    width: number,
    size = 15,
    font: Font = "regular",
    color: Color = palette.ink,
  ) {
    const face = fonts[font],
      draw = windowDrawList();
    if (!face) throw new Error("Diagram fonts and canvas must be initialized");
    ImDrawList_AddText_FontPtr(
      draw,
      face,
      size,
      point,
      packed(color),
      value,
      width,
    );
    captureWrappedText(value, font, size, point, width);
  }
  private line(a: Point, b: Point, color = palette.muted, dashed = false) {
    const draw = windowDrawList();
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!dashed) ImDrawList_AddLine(draw, a, b, packed(color), 1.3, 0);
    else
      for (let step = 0; step < length; step += 9) {
        const end = Math.min(length, step + 5);
        ImDrawList_AddLine(
          draw,
          {
            x: a.x + ((b.x - a.x) * step) / length,
            y: a.y + ((b.y - a.y) * step) / length,
          },
          {
            x: a.x + ((b.x - a.x) * end) / length,
            y: a.y + ((b.y - a.y) * end) / length,
          },
          packed(color),
          1.3,
          0,
        );
      }
  }
  private arrow(a: Point, b: Point, filled = true) {
    const draw = windowDrawList();
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const left = {
      x: b.x - 8 * Math.cos(angle - 0.4),
      y: b.y - 8 * Math.sin(angle - 0.4),
    };
    const right = {
      x: b.x - 8 * Math.cos(angle + 0.4),
      y: b.y - 8 * Math.sin(angle + 0.4),
    };
    if (filled)
      ImDrawList_AddTriangleFilled(draw, b, left, right, packed(palette.muted));
    else {
      this.line(left, b);
      this.line(b, right);
    }
  }
  draw(value: DiagramBlock, exporting: boolean) {
    if (value.kind === "sequence") this.sequence(value);
    else if (value.kind === "gantt") this.gantt(value, exporting);
    else this.graph(value, exporting);
  }
  private graph(value: Graph, exporting: boolean) {
    const width = available(),
      origin = igGetCursorScreenPos(),
      draw = windowDrawList();
    let cached = this.cache.get(value);
    if (!cached || cached.width !== width) {
      const layout = graphLayout(
        value.nodes,
        value.edges ?? [],
        width,
        (node, boxWidth) => {
          const labelWidth =
            node.shape === "decision" ? boxWidth * 0.55 : boxWidth - 24;
          const labelHeight = this.measure(
            node.label,
            labelWidth,
            15,
            "bold",
          ).y;
          const fieldHeight = (node.fields ?? []).reduce((height, field) => {
            const label = `${field.key === "primary" ? "PK " : field.key === "foreign" ? "FK " : ""}${field.name}${field.type ? `: ${field.type}` : ""}`;
            return (
              height + this.measure(label, boxWidth - 24, 13, "mono").y + 7
            );
          }, 0);
          return node.shape === "decision"
            ? Math.max(100, labelHeight * 2.3 + 16)
            : Math.max(60, labelHeight + fieldHeight + 32);
        },
        value.direction,
      );
      const placement = edgeLabelLayout(
        layout,
        width,
        (value.edges ?? []).map((edge) => {
          if (!edge.label) return undefined;
          const size = this.measure(edge.label, Math.min(160, width - 48), 14);
          return { width: size.x + 12, height: size.y + 8 };
        }),
      );
      layout.height = placement.height;
      cached = { width, layout, labels: placement.boxes };
      this.cache.set(value, cached);
    }
    const { layout } = cached;
    const offset = (p: Point) => ({ x: origin.x + p.x, y: origin.y + p.y });
    for (const [index, path] of layout.edges.entries()) {
      const edge = value.edges?.[index];
      if (!edge) continue;
      for (let i = 1; i < path.length; i++)
        this.line(offset(path[i - 1]), offset(path[i]));
      if (value.kind !== "er")
        this.arrow(
          offset(path[path.length - 2]),
          offset(path[path.length - 1]),
        );
    }
    for (const [i, node] of value.nodes.entries()) {
      const box = layout.nodes[i],
        a = offset(box),
        b = { x: a.x + box.width, y: a.y + box.height };
      const border =
        node.tone === "negative"
          ? palette.negative
          : node.tone === "warning"
            ? palette.warning
            : palette.diagramBorder;
      if (node.shape === "decision") {
        const top = { x: (a.x + b.x) / 2, y: a.y },
          right = { x: b.x, y: (a.y + b.y) / 2 },
          bottom = { x: top.x, y: b.y },
          left = { x: a.x, y: right.y };
        ImDrawList_AddQuadFilled(
          draw,
          top,
          right,
          bottom,
          left,
          packed(palette.surface),
        );
        ImDrawList_AddQuad(
          draw,
          top,
          right,
          bottom,
          left,
          packed(border),
          1.3,
          0,
        );
      } else {
        const rounding =
          node.shape === "start" || node.shape === "end" ? box.height / 2 : 8;
        ImDrawList_AddRectFilled(
          draw,
          a,
          b,
          packed(palette.surface),
          rounding,
          0,
        );
        ImDrawList_AddRect(draw, a, b, packed(border), rounding, 1.2, 0);
        if (node.shape === "end")
          ImDrawList_AddRect(
            draw,
            { x: a.x + 4, y: a.y + 4 },
            { x: b.x - 4, y: b.y - 4 },
            packed(border),
            rounding,
            1,
            0,
          );
      }
      const labelWidth =
        node.shape === "decision" ? box.width * 0.55 : box.width - 24;
      const labelSize = this.measure(node.label, labelWidth, 15, "bold");
      const top = node.fields?.length
        ? a.y + 12
        : (a.y + b.y - labelSize.y) / 2;
      this.label(
        node.label,
        { x: a.x + (box.width - labelSize.x) / 2, y: top },
        labelWidth,
        15,
        "bold",
      );
      if (node.fields?.length) {
        let y = top + labelSize.y + 12;
        this.line({ x: a.x, y: y - 6 }, { x: b.x, y: y - 6 }, palette.border);
        for (const field of node.fields) {
          const label = `${field.key === "primary" ? "PK " : field.key === "foreign" ? "FK " : ""}${field.name}${field.type ? `: ${field.type}` : ""}`;
          this.label(label, { x: a.x + 12, y }, box.width - 24, 13, "mono");
          y += this.measure(label, box.width - 24, 13, "mono").y + 7;
        }
      }
      keepTogether(a.y, b.y);
      if (!exporting && node.detail) {
        igSetCursorScreenPos(a);
        igPushID_Int(i);
        igInvisibleButton("node", { x: box.width, y: box.height }, 0);
        itemTooltip(node.detail);
        igPopID();
      }
    }
    for (const [index, path] of layout.edges.entries()) {
      const edge = value.edges?.[index];
      if (!edge) continue;
      const box = cached.labels[index];
      if (edge.label && box) {
        const point = offset(box);
        ImDrawList_AddRectFilled(
          draw,
          point,
          { x: point.x + box.width, y: point.y + box.height },
          packed(palette.paper),
          4,
          0,
        );
        this.label(
          edge.label,
          { x: point.x + 6, y: point.y + 4 },
          box.width - 12,
          14,
          "regular",
          palette.diagramLabel,
        );
      }
      for (const [value, start] of [
        [edge.fromCardinality, true],
        [edge.toCardinality, false],
      ] as const) {
        if (!value) continue;
        const label =
          value === "one"
            ? "1"
            : value === "zero-or-one"
              ? "0..1"
              : value === "one-or-many"
                ? "1..*"
                : "*";
        const p = offset(path[start ? 0 : path.length - 1]);
        const next = offset(path[start ? 1 : path.length - 2]);
        const size = this.measure(label, 50, 12);
        this.label(
          label,
          {
            x:
              next.x === p.x
                ? p.x + 8
                : next.x > p.x
                  ? p.x + 8
                  : p.x - size.x - 8,
            y: next.x === p.x && next.y > p.y ? p.y + 6 : p.y - size.y - 6,
          },
          50,
          12,
          "regular",
          palette.diagramLabel,
        );
      }
    }
    igSetCursorScreenPos(origin);
    igDummy({ x: width, y: layout.height });
  }
  private sequence(value: Extract<DiagramBlock, { kind: "sequence" }>) {
    const width = available();
    if (width < value.participants.length * 130) {
      const names = new Map(value.participants.map((p) => [p.id, p.label]));
      for (const [i, message] of value.messages.entries()) {
        const start = igGetCursorScreenPos().y;
        text(
          `${i + 1}. ${names.get(message.from)} → ${names.get(message.to)}`,
          14,
          "bold",
          palette.accent,
        );
        text(message.label, 15);
        keepTogether(start, igGetCursorScreenPos().y);
      }
      return;
    }
    const origin = igGetCursorScreenPos(),
      draw = windowDrawList();
    const step = width / value.participants.length;
    const positions = new Map(
      value.participants.map((p, i) => [p.id, origin.x + step * (i + 0.5)]),
    );
    const header =
      Math.max(
        ...value.participants.map((p) => this.measure(p.label, step - 24).y),
      ) + 24;
    const rows = value.messages.map((m) =>
      Math.max(
        58,
        this.measure(
          m.label,
          m.from === m.to
            ? step - 40
            : Math.max(
                100,
                Math.abs(
                  (positions.get(m.to) ?? 0) - (positions.get(m.from) ?? 0),
                ) - 24,
              ),
          13,
        ).y + 36,
      ),
    );
    const height = header + rows.reduce((sum, row) => sum + row, 0) + 20;
    for (const p of value.participants) {
      const x = positions.get(p.id) ?? origin.x;
      ImDrawList_AddRectFilled(
        draw,
        { x: x - step / 2 + 8, y: origin.y },
        { x: x + step / 2 - 8, y: origin.y + header - 8 },
        packed(palette.surface),
        7,
        0,
      );
      this.label(
        p.label,
        { x: x - step / 2 + 16, y: origin.y + 9 },
        step - 32,
        15,
        "bold",
      );
      this.line(
        { x, y: origin.y + header },
        { x, y: origin.y + height },
        palette.border,
        true,
      );
    }
    let y = origin.y + header;
    for (const [i, m] of value.messages.entries()) {
      const from = positions.get(m.from) ?? origin.x,
        to = positions.get(m.to) ?? origin.x;
      const labelWidth =
        m.from === m.to ? step - 40 : Math.max(100, Math.abs(to - from) - 24);
      this.label(
        m.label,
        { x: m.from === m.to ? from + 8 : Math.min(from, to) + 12, y: y + 5 },
        labelWidth,
        13,
      );
      const lineY = y + rows[i] - 12;
      if (m.from === m.to) {
        const side = from + Math.min(42, step / 3);
        this.line({ x: from, y: lineY - 14 }, { x: side, y: lineY - 14 });
        this.line({ x: side, y: lineY - 14 }, { x: side, y: lineY });
        this.line({ x: side, y: lineY }, { x: from, y: lineY });
        this.arrow({ x: side, y: lineY }, { x: from, y: lineY });
      } else {
        this.line(
          { x: from, y: lineY },
          { x: to, y: lineY },
          palette.muted,
          m.kind === "return",
        );
        this.arrow(
          { x: from, y: lineY },
          { x: to, y: lineY },
          m.kind !== "event",
        );
      }
      keepTogether(y, y + rows[i]);
      y += rows[i];
    }
    igDummy({ x: width, y: height });
  }
  private gantt(
    value: Extract<DiagramBlock, { kind: "gantt" }>,
    exporting: boolean,
  ) {
    const width = available();
    const dates = value.tasks.flatMap((task) => [
      Date.parse(`${task.start}T00:00:00Z`),
      Date.parse(`${task.end}T00:00:00Z`),
    ]);
    const min = Math.min(...dates),
      max = Math.max(...dates) + 86_400_000;
    text(
      `${new Date(min).toISOString().slice(0, 10)} – ${new Date(max - 86_400_000).toISOString().slice(0, 10)}`,
      13,
      "regular",
      palette.muted,
    );
    const origin = igGetCursorScreenPos(),
      draw = windowDrawList();
    const labelWidth = Math.min(200, Math.max(90, width * 0.3)),
      plotWidth = Math.max(20, width - labelWidth - 16);
    const x = (time: number) =>
      origin.x + labelWidth + ((time - min) / (max - min)) * plotWidth;
    const rows = value.tasks.map((task) =>
      Math.max(42, this.measure(task.label, labelWidth - 16, 14).y + 18),
    );
    const height = rows.reduce((a, b) => a + b, 0) + 44;
    const ticks = Math.max(2, Math.floor(plotWidth / 110));
    for (let i = 0; i < ticks; i++) {
      const time = min + ((max - min) * i) / (ticks - 1),
        label = new Date(time).toISOString().slice(5, 10);
      const position = x(time);
      this.label(
        label,
        { x: i === ticks - 1 ? position - 42 : position, y: origin.y },
        50,
        12,
        "regular",
        palette.muted,
      );
      this.line(
        { x: position, y: origin.y + 24 },
        { x: position, y: origin.y + height },
        palette.border,
      );
    }
    const points = new Map<string, { start: Point; end: Point }>();
    let top = origin.y + 32;
    for (const [i, task] of value.tasks.entries()) {
      const y = top + rows[i] / 2;
      const a = { x: x(Date.parse(`${task.start}T00:00:00Z`)), y: y - 9 },
        b = {
          x: x(Date.parse(`${task.end}T00:00:00Z`) + 86_400_000),
          y: y + 9,
        };
      this.label(task.label, { x: origin.x, y: top + 8 }, labelWidth - 16, 14);
      ImDrawList_AddRectFilled(
        draw,
        a,
        b,
        packed({ ...palette.accent, w: 0.25 }),
        4,
        0,
      );
      if ((task.progress ?? 0) > 0)
        ImDrawList_AddRectFilled(
          draw,
          a,
          { x: a.x + (b.x - a.x) * (task.progress ?? 0), y: b.y },
          packed(palette.accent),
          4,
          0,
        );
      points.set(task.id, { start: { x: a.x, y }, end: { x: b.x, y } });
      keepTogether(top, top + rows[i]);
      if (!exporting) {
        igSetCursorScreenPos({ x: origin.x, y: top });
        igPushID_Int(i);
        igInvisibleButton("task", { x: width, y: rows[i] }, 0);
        itemTooltip({
          title: task.label,
          subtitle: `${task.start} – ${task.end}`,
          detail: task.detail,
          rows:
            task.progress === undefined
              ? []
              : [
                  {
                    label: "Complete",
                    value: `${Math.round(task.progress * 100)}%`,
                  },
                ],
        });
        igPopID();
      }
      top += rows[i];
    }
    for (const task of value.tasks)
      for (const dependency of task.dependsOn ?? []) {
        const a = points.get(dependency)?.end,
          b = points.get(task.id)?.start;
        if (!a || !b) continue;
        const lane = Math.min(origin.x + width - 4, a.x + 8);
        this.line(a, { x: lane, y: a.y });
        this.line({ x: lane, y: a.y }, { x: lane, y: b.y });
        this.line({ x: lane, y: b.y }, b);
        this.arrow({ x: lane, y: b.y }, b);
      }
    igSetCursorScreenPos(origin);
    igDummy({ x: width, y: height });
  }
}
