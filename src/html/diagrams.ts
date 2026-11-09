import type { Diagram } from "../model.ts";
import { edgeLabelLayout, graphLayout } from "../ui/diagram-layout.ts";
import { escapeHtml, label, svg, wrap } from "./markup.ts";

export type Measure = (
  value: string,
  size: number,
  font?: "regular" | "bold" | "mono",
) => number;
const day = 86400000;
const date = (value: string) => Date.parse(`${value}T00:00:00Z`);
function lines(
  x: number,
  y: number,
  content: string[],
  size: number,
  anchor = "middle",
  weight = 400,
  color = "var(--pv-ink)",
): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}">${content.map((value, index) => `<tspan x="${x}" dy="${index ? size : 0}">${escapeHtml(value)}</tspan>`).join("")}</text>`;
}
function arrow(path: string, id: string, dashed = false, open = false): string {
  return `<path d="${path}" fill="none" stroke="var(--pv-muted)" stroke-width="1.5"${dashed ? ' stroke-dasharray="5 4"' : ""} marker-end="url(#${id}${open ? "-open" : ""})"/>`;
}
function markers(id: string): string {
  return `<defs><marker id="${id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0L8,4L0,8Z" fill="var(--pv-muted)"/></marker><marker id="${id}-open" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0L8,4L0,8" fill="none" stroke="var(--pv-muted)"/></marker></defs>`;
}

export function diagram(
  value: Diagram,
  width: number,
  key: string,
  measure: Measure,
): string {
  const id = `arrow-${key}`;
  let drawing = markers(id),
    height = 160;
  let prefix = "";
  if (value.kind === "sequence") {
    const participants = value.participants;
    if (width < participants.length * 130) {
      const names = new Map(
        participants.map((participant) => [participant.id, participant.label]),
      );
      return `<ol class="pv-sequence">${value.messages.map((message) => `<li><strong>${escapeHtml(names.get(message.from))} → ${escapeHtml(names.get(message.to))}</strong><p>${escapeHtml(message.label)}</p></li>`).join("")}</ol>`;
    }
    const lane = width / participants.length;
    const header =
      Math.max(
        ...participants.map(
          (participant) =>
            wrap(participant.label, lane - 24, 15, measure).length * 15,
        ),
      ) + 24;
    const indices = new Map(
      participants.map((participant, index) => [participant.id, index]),
    );
    const positions: { y: number; lines: string[]; height: number }[] = [];
    let y = header;
    for (const message of value.messages) {
      const from = indices.get(message.from) ?? 0,
        to = indices.get(message.to) ?? 0;
      const text = wrap(
        message.label,
        from === to
          ? lane - 40
          : Math.max(100, Math.abs(from - to) * lane - 24),
        13,
        measure,
      );
      const row = Math.max(58, text.length * 13 + 36);
      positions.push({ y, lines: text, height: row });
      y += row;
    }
    height = y + 20;
    participants.forEach((participant, index) => {
      const x = lane * (index + 0.5),
        w = lane - 16;
      drawing += `<path d="M${x},${header}V${height}" stroke="var(--pv-border)" stroke-dasharray="5 5"/><rect x="${x - w / 2}" y="0" width="${w}" height="${header - 8}" rx="7" fill="var(--pv-surface)"/>${lines(index * lane + 16, 21, wrap(participant.label, lane - 32, 15, measure), 15, "start", 600)}`;
    });
    value.messages.forEach((message, index) => {
      const x1 = lane * ((indices.get(message.from) ?? 0) + 0.5),
        x2 = lane * ((indices.get(message.to) ?? 0) + 0.5),
        row = positions[index],
        lineY = row.y + row.height - 12,
        side = Math.min(42, lane / 3);
      const path =
        x1 === x2
          ? `M${x1},${lineY - 14}h${side}v14h${-side}`
          : `M${x1},${lineY}H${x2}`;
      drawing +=
        arrow(path, id, message.kind === "return", message.kind === "event") +
        lines(
          x1 === x2 ? x1 + 8 : Math.min(x1, x2) + 12,
          row.y + 15,
          row.lines,
          13,
          "start",
        );
    });
  } else if (value.kind === "gantt") {
    const tasks = value.tasks;
    const start = Math.min(...tasks.map((task) => date(task.start))),
      end = Math.max(...tasks.map((task) => date(task.end) + day));
    prefix = `<p class="pv-caption" style="margin:0 0 12px;font-size:13px">${new Date(start).toISOString().slice(0, 10)} – ${new Date(end - day).toISOString().slice(0, 10)}</p>`;
    const labelWidth = Math.min(200, Math.max(90, width * 0.3)),
      plotWidth = Math.max(20, width - labelWidth - 16);
    const at = (value: number) =>
      labelWidth + ((value - start) / Math.max(day, end - start)) * plotWidth;
    const rows = tasks.map((task) =>
      Math.max(
        42,
        wrap(task.label, labelWidth - 14, 14, measure).length * 19 + 15,
      ),
    );
    const tops: number[] = [];
    let y = 32;
    for (const row of rows) {
      tops.push(y);
      y += row;
    }
    height = y + 12;
    for (let i = 0; i <= 4; i++) {
      const time = start + ((end - start) * i) / 4,
        x = at(time);
      drawing += `<path d="M${x},32V${height - 12}" stroke="var(--pv-border)"/>${label(x, 20, new Date(time).toISOString().slice(5, 10), 11)}`;
    }
    const indices = new Map(tasks.map((task, index) => [task.id, index]));
    tasks.forEach((task, index) => {
      const y = tops[index] + rows[index] / 2,
        x = at(date(task.start)),
        w = at(date(task.end) + day) - x;
      const detail = `${task.label}\n${task.start} to ${task.end}${task.progress === undefined ? "" : ` · ${Math.round(task.progress * 100)}%`}${task.detail ? `\n\n${task.detail}` : ""}`;
      drawing += `<g data-tooltip="${escapeHtml(detail)}" tabindex="0" role="group" aria-label="${escapeHtml(task.detail ? `${task.label}: ${task.detail}` : task.label)}">`;
      drawing += lines(
        0,
        tops[index] + 17,
        wrap(task.label, labelWidth - 14, 14, measure),
        14,
        "start",
      );
      for (const dependency of task.dependsOn ?? []) {
        const previous = indices.get(dependency);
        if (previous === undefined) continue;
        const sx = at(date(tasks[previous].end) + day),
          sy = tops[previous] + rows[previous] / 2;
        drawing += arrow(`M${sx},${sy}H${sx + 8}V${y}H${x}`, id);
      }
      drawing += `<rect x="${x}" y="${y - 9}" width="${Math.max(1, w)}" height="18" rx="4" fill="var(--pv-accent)" fill-opacity=".3"/>${task.progress === undefined ? "" : `<rect x="${x}" y="${y - 9}" width="${w * task.progress}" height="18" rx="4" fill="var(--pv-accent)"/>`}</g>`;
    });
  } else {
    const layout = graphLayout(
      value.nodes,
      value.edges ?? [],
      width,
      (node, boxWidth) => {
        const labelWidth =
          node.shape === "decision" ? boxWidth * 0.55 : boxWidth - 24;
        const lh =
          wrap(node.label, labelWidth, 15, (text, size) =>
            measure(text, size, "bold"),
          ).length * 15;
        const fields = (node.fields ?? []).reduce(
          (height, field) =>
            height +
            wrap(
              `${field.key === "primary" ? "PK " : field.key === "foreign" ? "FK " : ""}${field.name}${field.type ? `: ${field.type}` : ""}`,
              boxWidth - 24,
              13,
              (text, size) => measure(text, size, "mono"),
            ).length *
              13 +
            7,
          0,
        );
        return node.shape === "decision"
          ? Math.max(100, lh * 2.3 + 16)
          : Math.max(60, lh + fields + 32);
      },
      value.direction,
    );
    const labels = (value.edges ?? []).map((edge) =>
      edge.label
        ? wrap(edge.label, Math.min(160, width - 48), 14, measure)
        : [],
    );
    const placement = edgeLabelLayout(
      layout,
      width,
      labels.map((text) =>
        text.length
          ? {
              width: Math.max(...text.map((line) => measure(line, 14))) + 12,
              height: text.length * 14 + 8,
            }
          : undefined,
      ),
    );
    height = placement.height;
    const cardinality = (value: string) =>
      ({ one: "1", "zero-or-one": "0..1", many: "*", "one-or-many": "1..*" })[
        value
      ] ?? value;
    layout.edges.forEach((path, index) => {
      const edge = value.edges?.[index];
      if (!edge) return;
      const d = path
        .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
        .join(" ");
      drawing +=
        value.kind === "er"
          ? `<path d="${d}" fill="none" stroke="var(--pv-muted)" stroke-width="1.5"/>`
          : arrow(d, id);
    });
    value.nodes.forEach((node, index) => {
      const box = layout.nodes[index],
        cx = box.x + box.width / 2,
        cy = box.y + box.height / 2;
      const border =
        node.tone === "warning"
          ? "var(--pv-warning)"
          : node.tone === "negative"
            ? "var(--pv-negative)"
            : "var(--pv-diagramBorder)";
      drawing += `<g${node.detail ? ` data-tooltip="${escapeHtml(node.detail)}" tabindex="0" aria-label="${escapeHtml(`${node.label}: ${node.detail}`)}"` : ""}>`;
      drawing +=
        node.shape === "decision"
          ? `<path d="M${cx},${box.y}L${box.x + box.width},${cy}L${cx},${box.y + box.height}L${box.x},${cy}Z" fill="var(--pv-surface)" stroke="${border}"/>`
          : `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${node.shape === "start" || node.shape === "end" ? box.height / 2 : 8}" fill="var(--pv-surface)" stroke="${border}"/>`;
      if (node.shape === "end")
        drawing += `<rect x="${box.x + 4}" y="${box.y + 4}" width="${box.width - 8}" height="${box.height - 8}" rx="${(box.height - 8) / 2}" fill="none" stroke="${border}"/>`;
      const text = wrap(
        node.label,
        node.shape === "decision" ? box.width * 0.55 : box.width - 24,
        15,
        (text, size) => measure(text, size, "bold"),
      );
      let y = node.fields?.length
        ? box.y + 24
        : cy - (text.length - 1) * 10 + 5;
      drawing += lines(cx, y, text, 15, "middle", 600);
      y += text.length * 15 + 9;
      if (node.fields?.length) {
        drawing += `<path d="M${box.x + 8},${y - 6}h${box.width - 16}" stroke="var(--pv-border)"/>`;
        for (const field of node.fields) {
          const text = wrap(
            `${field.key === "primary" ? "PK " : field.key === "foreign" ? "FK " : ""}${field.name}${field.type ? `: ${field.type}` : ""}`,
            box.width - 24,
            13,
            (text, size) => measure(text, size, "mono"),
          );
          drawing += `<g font-family="PVMono,monospace">${lines(box.x + 12, y + 9, text, 13, "start")}</g>`;
          y += text.length * 13 + 7;
        }
      }
      drawing += "</g>";
    });
    layout.edges.forEach((path, index) => {
      const edge = value.edges?.[index];
      if (!edge) return;
      const box = placement.boxes[index];
      if (box)
        drawing += `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="4" fill="var(--pv-paper)"/>${lines(box.x + 6, box.y + 18, labels[index], 14, "start", 400, "var(--pv-diagramLabel)")}`;
      for (const [value, start] of [
        [edge.fromCardinality, true],
        [edge.toCardinality, false],
      ] as const) {
        if (!value) continue;
        const text = cardinality(value),
          size = measure(text, 12),
          p = path[start ? 0 : path.length - 1],
          next = path[start ? 1 : path.length - 2];
        drawing += lines(
          next.x === p.x ? p.x + 8 : next.x > p.x ? p.x + 8 : p.x - size - 8,
          next.x === p.x && next.y > p.y ? p.y + 18 : p.y - 6,
          [text],
          12,
          "start",
          400,
          "var(--pv-diagramLabel)",
        );
      }
    });
  }
  return `<figure class="pv-diagram" data-diagram="${escapeHtml(key)}">${prefix}${svg(width, height, value.kind ?? "flowchart", drawing)}<div class="pv-zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="fit" aria-label="Fit diagram">⌖</button></div></figure>`;
}
