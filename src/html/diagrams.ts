import type { Diagram } from "../model.ts";
import { graphLayout } from "../ui/diagram-layout.ts";
import { escapeHtml, label, svg, wrap } from "./markup.ts";

export type Measure = (value: string, size: number) => number;
const day = 86400000;
const date = (value: string) => Date.parse(`${value}T00:00:00Z`);
function lines(
  x: number,
  y: number,
  content: string[],
  size: number,
  anchor = "middle",
  weight = 400,
): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="var(--pv-ink)">${content.map((value, index) => `<tspan x="${x}" dy="${index ? size : 0}">${escapeHtml(value)}</tspan>`).join("")}</text>`;
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
      drawing += `<g data-tooltip="${escapeHtml(`${task.label}: ${task.start} to ${task.end}${task.progress === undefined ? "" : `, ${Math.round(task.progress * 100)}%`}`)}"><rect x="${x}" y="${y - 9}" width="${Math.max(1, w)}" height="18" rx="4" fill="var(--pv-accent)" fill-opacity=".3"/>${task.progress === undefined ? "" : `<rect x="${x}" y="${y - 9}" width="${w * task.progress}" height="18" rx="4" fill="var(--pv-accent)"/>`}</g>`;
    });
  } else {
    const heights = value.nodes.map((node) => {
      const lw = Math.min(node.shape === "decision" ? 100 : 160, width - 84),
        lh = wrap(node.label, lw, 15, measure).length * 15;
      const fields = (node.fields ?? []).reduce(
        (height, field) =>
          height +
          wrap(
            `${field.key === "primary" ? "PK " : field.key === "foreign" ? "FK " : ""}${field.name}${field.type ? `: ${field.type}` : ""}`,
            lw,
            13,
            measure,
          ).length *
            13 +
          7,
        0,
      );
      return node.shape === "decision"
        ? Math.max(100, lh * 2.3 + 16)
        : Math.max(60, lh + fields + 32);
    });
    const layout = graphLayout(
      value.nodes,
      value.edges ?? [],
      width,
      heights,
      value.direction,
    );
    height = layout.height;
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
      if (edge.label) {
        let longest = 1;
        for (let j = 2; j < path.length; j++)
          if (
            Math.hypot(path[j].x - path[j - 1].x, path[j].y - path[j - 1].y) >
            Math.hypot(
              path[longest].x - path[longest - 1].x,
              path[longest].y - path[longest - 1].y,
            )
          )
            longest = j;
        const a = path[longest - 1],
          b = path[longest],
          text = wrap(edge.label, Math.min(160, width - 48), 13, measure),
          textWidth = Math.max(...text.map((line) => measure(line, 13))),
          x = Math.max(
            8,
            Math.min(width - textWidth - 8, (a.x + b.x - textWidth) / 2),
          );
        drawing += `<rect x="${x - 4}" y="${(a.y + b.y) / 2 - 17}" width="${textWidth + 8}" height="${text.length * 18 + 4}" fill="var(--pv-paper)"/>${lines(x, (a.y + b.y) / 2 - 3, text, 13, "start")}`;
      }
      if (edge.fromCardinality)
        drawing += label(
          path[0].x + 5,
          path[0].y + 17,
          cardinality(edge.fromCardinality),
          12,
          "start",
        );
      if (edge.toCardinality)
        drawing += label(
          path[path.length - 1].x + 5,
          path[path.length - 1].y - 9,
          cardinality(edge.toCardinality),
          12,
          "start",
        );
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
            : "var(--pv-border)";
      drawing += `<g${node.detail ? ` data-tooltip="${escapeHtml(node.detail)}" tabindex="0" aria-label="${escapeHtml(`${node.label}: ${node.detail}`)}"` : ""}>`;
      drawing +=
        node.shape === "decision"
          ? `<path d="M${cx},${box.y}L${box.x + box.width},${cy}L${cx},${box.y + box.height}L${box.x},${cy}Z" fill="var(--pv-surface)" stroke="${border}"/>`
          : `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${node.shape === "start" || node.shape === "end" ? box.height / 2 : 8}" fill="var(--pv-surface)" stroke="${border}"/>`;
      if (node.shape === "end")
        drawing += `<rect x="${box.x + 4}" y="${box.y + 4}" width="${box.width - 8}" height="${box.height - 8}" rx="${(box.height - 8) / 2}" fill="none" stroke="${border}"/>`;
      const text = wrap(
        node.label,
        node.shape === "decision" ? box.width * 0.55 : box.width - 28,
        15,
        measure,
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
            box.width - 28,
            13,
            measure,
          );
          drawing += `<g font-family="PVMono,monospace">${lines(box.x + 14, y + 9, text, 13, "start")}</g>`;
          y += text.length * 13 + 7;
        }
      }
      drawing += "</g>";
    });
  }
  return `<figure class="pv-diagram" data-diagram="${escapeHtml(key)}">${prefix}${svg(width, height, value.kind ?? "flowchart", drawing)}<div class="pv-zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="fit" aria-label="Fit diagram">⌖</button></div></figure>`;
}
