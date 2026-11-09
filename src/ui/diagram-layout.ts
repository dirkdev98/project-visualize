import type { DiagramEdge, DiagramNode } from "../model.ts";

export interface Point {
  x: number;
  y: number;
}
export interface Box extends Point {
  width: number;
  height: number;
}
export interface GraphLayout {
  nodes: Box[];
  edges: Point[][];
  height: number;
}

/**
 * Assigns each node a layer by longest path. A depth-first search from the
 * nodes nothing points to drops edges back into the active path, so a retry
 * loop keeps its forward steps in successive layers and returns upwards.
 */
function ranks(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const indices = new Map(nodes.map((node, i) => [node.id, i]));
  const links = nodes.map(() => [] as number[]),
    incoming = nodes.map(() => 0);
  for (const edge of edges) {
    const from = indices.get(edge.from) ?? 0,
      to = indices.get(edge.to) ?? 0;
    links[from].push(to);
    if (from !== to) incoming[to]++;
  }
  const visited = nodes.map(() => false),
    active = new Set<number>(),
    forward: [number, number][] = [];
  const visit = (v: number) => {
    visited[v] = true;
    active.add(v);
    for (const next of links[v]) {
      if (active.has(next)) continue;
      forward.push([v, next]);
      if (!visited[next]) visit(next);
    }
    active.delete(v);
  };
  for (const roots of [true, false])
    for (let i = 0; i < nodes.length; i++)
      if (!visited[i] && (incoming[i] === 0) === roots) visit(i);
  const levels = nodes.map(() => 0);
  for (let round = 0; round < nodes.length; round++)
    for (const [from, to] of forward)
      levels[to] = Math.max(levels[to], levels[from] + 1);
  return levels;
}

function route(
  a: Box,
  b: Box,
  obstacles: Box[],
  width: number,
  height: number,
  right: boolean,
  index: number,
  back = false,
): Point[] {
  if (a === b) {
    const x = a.x + a.width,
      y = a.y + a.height / 3,
      lane = Math.min(width - 6, x + 20 + (index % 3) * 6);
    return [
      { x, y },
      { x: lane, y },
      { x: lane, y: a.y + a.height + 14 },
      { x: x - 18, y: a.y + a.height + 14 },
      { x: x - 18, y: a.y + a.height },
    ];
  }
  const horizontal =
    (a.x + a.width <= b.x || b.x + b.width <= a.x) &&
    (right || !(a.y + a.height <= b.y || b.y + b.height <= a.y));
  const forward = horizontal ? b.x > a.x : b.y > a.y;
  const sign = forward ? 1 : -1;
  let start = horizontal
    ? { x: forward ? a.x + a.width : a.x, y: a.y + a.height / 2 }
    : { x: a.x + a.width / 2, y: forward ? a.y + a.height : a.y };
  let end = horizontal
    ? { x: forward ? b.x : b.x + b.width, y: b.y + b.height / 2 }
    : { x: b.x + b.width / 2, y: forward ? b.y : b.y + b.height };
  let from = {
    x: start.x + (horizontal ? sign * 10 : 0),
    y: start.y + (horizontal ? 0 : sign * 10),
  };
  let to = {
    x: end.x - (horizontal ? sign * 10 : 0),
    y: end.y - (horizontal ? 0 : sign * 10),
  };
  // An edge against the flow leaves and enters beside it, on the right in a
  // vertical layout and underneath in a horizontal one, so it loops around
  // instead of sharing a port with the forward connector.
  if (back) {
    start = right
      ? { x: a.x + a.width / 2, y: a.y + a.height }
      : { x: a.x + a.width, y: a.y + a.height / 2 };
    end = right
      ? { x: b.x + b.width / 2, y: b.y + b.height }
      : { x: b.x + b.width, y: b.y + b.height / 2 };
    const offset = right ? { x: 0, y: 10 } : { x: 10, y: 0 };
    from = { x: start.x + offset.x, y: start.y + offset.y };
    to = { x: end.x + offset.x, y: end.y + offset.y };
  }
  const expanded = obstacles.map((box) => ({
    x: box.x - 6,
    y: box.y - 6,
    width: box.width + 12,
    height: box.height + 12,
  }));
  const xs = [
    ...new Set([
      6,
      width - 6,
      from.x,
      to.x,
      ...expanded.flatMap((box) => [box.x - 1, box.x + box.width + 1]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      6,
      height - 6,
      from.y,
      to.y,
      ...expanded.flatMap((box) => [box.y - 1, box.y + box.height + 1]),
    ]),
  ].sort((a, b) => a - b);
  const key = (x: number, y: number) => y * xs.length + x;
  const first = key(xs.indexOf(from.x), ys.indexOf(from.y)),
    last = key(xs.indexOf(to.x), ys.indexOf(to.y));
  const point = (id: number) => ({
    x: xs[id % xs.length],
    y: ys[Math.floor(id / xs.length)],
  });
  const free = (a: Point, b: Point) =>
    !expanded.some((box) =>
      a.x === b.x
        ? a.x > box.x &&
          a.x < box.x + box.width &&
          Math.max(a.y, b.y) > box.y &&
          Math.min(a.y, b.y) < box.y + box.height
        : a.y > box.y &&
          a.y < box.y + box.height &&
          Math.max(a.x, b.x) > box.x &&
          Math.min(a.x, b.x) < box.x + box.width,
    );
  const queue: { id: number; cost: number; score: number }[] = [
    { id: first, cost: 0, score: 0 },
  ];
  const costs = new Map<number, number>([[first, 0]]),
    previous = new Map<number, number>();
  let found = false;
  while (queue.length) {
    queue.sort((a, b) => b.score - a.score);
    const current = queue.pop();
    if (!current) break;
    if (current.cost !== costs.get(current.id)) continue;
    if (current.id === last) {
      found = true;
      break;
    }
    const x = current.id % xs.length,
      y = Math.floor(current.id / xs.length),
      a = point(current.id);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || nx >= xs.length || ny < 0 || ny >= ys.length) continue;
      const id = key(nx, ny),
        b = point(id);
      if (!free(a, b)) continue;
      const cost = current.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (cost >= (costs.get(id) ?? Infinity)) continue;
      costs.set(id, cost);
      previous.set(id, current.id);
      queue.push({
        id,
        cost,
        score: cost + Math.abs(b.x - to.x) + Math.abs(b.y - to.y),
      });
    }
  }
  if (!found)
    throw new Error(
      "Diagram connector cannot be routed; adjust overlapping explicit node positions",
    );
  const path = [to];
  let cursor = last;
  while (cursor !== first) {
    cursor = previous.get(cursor) ?? first;
    path.push(point(cursor));
  }
  path.reverse();
  const result = [start, ...path, end];
  return result.filter(
    (p, i) =>
      i === 0 ||
      i === result.length - 1 ||
      !(
        (result[i - 1].x === p.x && p.x === result[i + 1].x) ||
        (result[i - 1].y === p.y && p.y === result[i + 1].y)
      ),
  );
}

/**
 * Start positions for one layer of boxes along the cross axis. Boxes centre on
 * their target, usually their parents' average position, and siblings sharing a
 * target centre as a group. A layer without targets centres within `extent`, or
 * starts at the margin when the extent is open. Boxes keep `gap` apart and stay
 * within the 24px margin.
 */
function placeLayer(
  targets: (number | undefined)[],
  sizes: number[],
  gap: number,
  extent: number,
): number[] {
  const total = sizes.reduce((sum, size) => sum + size + gap, -gap);
  const packed = (start: number) => {
    let at = start;
    return sizes.map((size) => {
      const position = at;
      at += size + gap;
      return position;
    });
  };
  if (targets.some((target) => target === undefined))
    return packed(Number.isFinite(extent) ? (extent - total) / 2 : 24);
  const order = targets
    .map((target, i) => ({ target: target ?? 0, i }))
    .sort((a, b) => a.target - b.target);
  const starts: number[] = [];
  let cursor = 24;
  for (let first = 0; first < order.length; ) {
    let end = first + 1;
    while (
      end < order.length &&
      Math.abs(order[end].target - order[first].target) < 0.5
    )
      end++;
    const span = order
      .slice(first, end)
      .reduce((sum, { i }) => sum + sizes[i] + gap, -gap);
    let at = Math.max(cursor, order[first].target - span / 2);
    for (let k = first; k < end; k++) {
      starts[k] = at;
      at += sizes[order[k].i] + gap;
    }
    cursor = at;
    first = end;
  }
  const last = order[order.length - 1];
  const overflow = Math.max(
    0,
    starts[starts.length - 1] + sizes[last.i] - (extent - 24),
  );
  const result: number[] = [];
  let minimum = 24;
  for (const [k, { i }] of order.entries()) {
    result[i] = Math.max(starts[k] - overflow, minimum);
    minimum = result[i] + sizes[i] + gap;
  }
  return result;
}

export function graphLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  width: number,
  measure: (node: DiagramNode, width: number) => number,
  direction = "down",
  gap = 64,
): GraphLayout {
  const levels = ranks(nodes, edges),
    layers = new Map<number, number[]>();
  const right =
    direction === "right" && width >= 640 && Math.max(...levels) < 4;
  for (let i = 0; i < nodes.length; i++) {
    const layer = layers.get(levels[i]) ?? [];
    layer.push(i);
    layers.set(levels[i], layer);
  }
  const indices = new Map(nodes.map((node, i) => [node.id, i]));
  const parents = nodes.map(() => [] as number[]),
    children = nodes.map(() => [] as number[]);
  for (const edge of edges) {
    const from = indices.get(edge.from) ?? 0,
      to = indices.get(edge.to) ?? 0;
    if (levels[from] < levels[to]) {
      parents[to].push(from);
      children[from].push(to);
    }
  }
  const sorted = [...layers].sort((a, b) => a[0] - b[0]);
  const boxes: Box[] = [];
  // The centre of the span that a node's parents or children cover.
  const middle = (members: number[], axis: "x" | "y") => {
    if (!members.length) return undefined;
    const size = (i: number) =>
      axis === "x" ? boxes[i].width : boxes[i].height;
    return (
      (Math.min(...members.map((i) => boxes[i][axis])) +
        Math.max(...members.map((i) => boxes[i][axis] + size(i)))) /
      2
    );
  };
  let y = 24;
  if (right) {
    const count = layers.size,
      boxWidth = Math.min(190, (width - 48 - (count - 1) * gap) / count);
    if (boxWidth >= 100) {
      for (const [level, layer] of sorted) {
        const heights = layer.map((i) => measure(nodes[i], boxWidth));
        const tops = placeLayer(
          layer.map((i) => middle(parents[i], "y")),
          heights,
          48,
          Infinity,
        );
        for (const [k, i] of layer.entries())
          boxes[i] = {
            x:
              (width - count * boxWidth - (count - 1) * gap) / 2 +
              level * (boxWidth + gap),
            y: tops[k],
            width: boxWidth,
            height: heights[k],
          };
      }
      // Then centre each parent on its children, deepest layers first.
      for (const [, layer] of sorted.slice(0, -1).reverse()) {
        const tops = placeLayer(
          layer.map(
            (i) => middle(children[i], "y") ?? boxes[i].y + boxes[i].height / 2,
          ),
          layer.map((i) => boxes[i].height),
          48,
          Infinity,
        );
        for (const [k, i] of layer.entries()) boxes[i].y = tops[k];
      }
    }
  }
  if (!boxes.length) {
    const columns = Math.max(1, Math.floor((width - 32) / 210));
    for (const [, layer] of sorted)
      for (let row = 0; row < layer.length; row += columns) {
        const group = layer.slice(row, row + columns),
          boxWidth = Math.min(
            210,
            (width - 48 - (group.length - 1) * 40) / group.length,
          );
        const left = placeLayer(
          group.map((i) => middle(parents[i], "x")),
          group.map(() => boxWidth),
          40,
          width,
        );
        for (const [column, i] of group.entries())
          boxes[i] = {
            x: left[column],
            y,
            width: boxWidth,
            height: measure(nodes[i], boxWidth),
          };
        const rowHeight = Math.max(...group.map((i) => boxes[i].height));
        for (const i of group) boxes[i].y += (rowHeight - boxes[i].height) / 2;
        y += rowHeight + 74;
      }
  }
  const height = Math.max(160, ...boxes.map((box) => box.y + box.height + 24));
  const positioned = boxes.map((box) => ({ ...box }));
  for (const [i, node] of nodes.entries()) {
    if (node.x !== undefined)
      positioned[i].x = 24 + node.x * Math.max(0, width - boxes[i].width - 48);
    if (node.y !== undefined)
      positioned[i].y =
        24 + node.y * Math.max(0, height - boxes[i].height - 48);
  }
  const crowded = positioned.some((box, i) =>
    positioned.some(
      (other, j) =>
        j > i &&
        box.x < other.x + other.width + 24 &&
        box.x + box.width + 24 > other.x &&
        box.y < other.y + other.height + 24 &&
        box.y + box.height + 24 > other.y,
    ),
  );
  if (!crowded) for (let i = 0; i < boxes.length; i++) boxes[i] = positioned[i];
  return {
    nodes: boxes,
    height,
    edges: edges.map((edge, i) => {
      const from = indices.get(edge.from) ?? 0,
        to = indices.get(edge.to) ?? 0;
      return route(
        boxes[from],
        boxes[to],
        boxes,
        width,
        height,
        right,
        i,
        from !== to && levels[from] >= levels[to],
      );
    }),
  };
}

/**
 * Gap between the columns of a horizontal layout, wide enough to keep each
 * connector label on its connector, clear of the endpoint cardinalities that
 * sit beside both ends.
 */
export function layerGap(
  labelWidths: readonly (number | undefined)[],
  cardinalities: boolean,
): number {
  return Math.max(
    64,
    ...labelWidths.map((width) =>
      width === undefined ? 0 : width + 12 + (cardinalities ? 80 : 0),
    ),
  );
}

export function edgeLabelLayout(
  layout: GraphLayout,
  width: number,
  sizes: ({ width: number; height: number } | undefined)[],
): { boxes: (Box | undefined)[]; height: number } {
  const occupied = [...layout.nodes];
  let height = layout.height;
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.width + 6 &&
    a.x + a.width + 6 > b.x &&
    a.y < b.y + b.height + 6 &&
    a.y + a.height + 6 > b.y;
  const boxes = sizes.map((size, index) => {
    if (!size) return undefined;
    const path = layout.edges[index];
    const segments = path
      .slice(1)
      .map((b, i) => ({
        a: path[i],
        b,
        length: Math.abs(b.x - path[i].x) + Math.abs(b.y - path[i].y),
      }))
      .sort((a, b) => b.length - a.length);
    const first = segments[0];
    const anchor = {
      x: (first.a.x + first.b.x) / 2,
      y: (first.a.y + first.b.y) / 2,
    };
    let best: Box | undefined;
    let cost = Infinity;
    const consider = (x: number, y: number, score: number) => {
      const box = {
        ...size,
        x: Math.max(8, Math.min(width - size.width - 8, x)),
        y: Math.max(8, Math.min(height - size.height - 8, y)),
      };
      if (score >= cost || occupied.some((other) => overlaps(box, other)))
        return;
      best = box;
      cost = score;
    };
    for (const { a, b, length } of segments)
      for (const t of [0.5, 0.25, 0.75]) {
        const x = a.x + (b.x - a.x) * t - size.width / 2;
        const y = a.y + (b.y - a.y) * t - size.height / 2;
        const score = first.length - length + Math.abs(t - 0.5) * length;
        consider(x, y, score);
        if (a.y === b.y) {
          consider(x, y - size.height / 2 - 8, score + 8);
          consider(x, y + size.height / 2 + 8, score + 8);
        } else {
          consider(x - size.width / 2 - 8, y, score + 8);
          consider(x + size.width / 2 + 8, y, score + 8);
        }
      }
    if (!best)
      for (let y = 8; y + size.height <= height - 8; y += 16)
        for (let x = 8; x + size.width <= width - 8; x += 16)
          consider(
            x,
            y,
            Math.hypot(
              x + size.width / 2 - anchor.x,
              y + size.height / 2 - anchor.y,
            ),
          );
    if (!best) {
      best = { ...size, x: 8, y: height + 8 };
      height += size.height + 16;
    }
    occupied.push(best);
    return best;
  });
  return { boxes, height };
}

const day = 86_400_000;

/**
 * Gridlines for a Gantt axis over `[start, end)`, on day boundaries so bars
 * start and end on a line. Each line labels the day that follows it when the
 * column leaves room for the label; the closing line at `end` has none.
 */
export function ganttTicks(start: number, end: number, width: number) {
  const days = Math.max(1, Math.round((end - start) / day)),
    perDay = width / days;
  const step =
    [1, 2, 7, 14, 28, 91, 182, 364].find((n) => n * perDay >= 56) ??
    Math.ceil(56 / perDay);
  const ticks: { time: number; label?: string }[] = [];
  for (let offset = 0; offset < days; offset += step) {
    const time = start + offset * day;
    ticks.push({
      time,
      label:
        (days - offset) * perDay >= 40
          ? new Date(time).toISOString().slice(5, 10)
          : undefined,
    });
  }
  ticks.push({ time: start + days * day });
  return ticks;
}

/**
 * Route for a finish-to-start dependency. It enters the dependent bar from the
 * left when there is room, and otherwise drops onto the bar's edge, so the
 * arrowhead never sits on the bar's fill.
 */
export function ganttDependency(
  from: Point,
  to: Box,
): { points: Point[]; head: [Point, Point] } {
  const lane = from.x + 8;
  if (to.x >= lane + 8) {
    const end = { x: to.x, y: to.y + to.height / 2 },
      turn = { x: lane, y: end.y };
    return {
      points: [from, { x: lane, y: from.y }, turn, end],
      head: [turn, end],
    };
  }
  const x = Math.max(to.x + 6, Math.min(lane, to.x + to.width - 6)),
    below = to.y + to.height / 2 < from.y;
  const end = { x, y: below ? to.y + to.height : to.y },
    corner = { x, y: from.y };
  return {
    points: [from, corner, end],
    head: [corner, end],
  };
}
