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

function ranks(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const indices = new Map(nodes.map((node, i) => [node.id, i]));
  const links = nodes.map(() => [] as number[]);
  for (const edge of edges)
    links[indices.get(edge.from) ?? 0].push(indices.get(edge.to) ?? 0);
  const stack: number[] = [],
    active = new Set<number>(),
    order = nodes.map(() => -1),
    low = [...order],
    components = [...order];
  let cursor = 0,
    component = 0;
  const visit = (v: number) => {
    low[v] = order[v] = cursor++;
    stack.push(v);
    active.add(v);
    for (const next of links[v]) {
      if (order[next] < 0) {
        visit(next);
        low[v] = Math.min(low[v], low[next]);
      } else if (active.has(next)) low[v] = Math.min(low[v], order[next]);
    }
    if (low[v] === order[v]) {
      let member: number;
      do {
        member = stack.pop() ?? v;
        active.delete(member);
        components[member] = component;
      } while (member !== v);
      component++;
    }
  };
  for (let i = 0; i < nodes.length; i++) if (order[i] < 0) visit(i);
  const levels = new Array<number>(component).fill(0);
  for (let round = 0; round < component; round++)
    for (let i = 0; i < links.length; i++)
      for (const next of links[i]) {
        if (components[i] !== components[next])
          levels[components[next]] = Math.max(
            levels[components[next]],
            levels[components[i]] + 1,
          );
      }
  return components.map((c) => levels[c]);
}

function route(
  a: Box,
  b: Box,
  obstacles: Box[],
  width: number,
  height: number,
  right: boolean,
  index: number,
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
  const start = horizontal
    ? { x: forward ? a.x + a.width : a.x, y: a.y + a.height / 2 }
    : { x: a.x + a.width / 2, y: forward ? a.y + a.height : a.y };
  const end = horizontal
    ? { x: forward ? b.x : b.x + b.width, y: b.y + b.height / 2 }
    : { x: b.x + b.width / 2, y: forward ? b.y : b.y + b.height };
  const from = {
    x: start.x + (horizontal ? sign * 10 : 0),
    y: start.y + (horizontal ? 0 : sign * 10),
  };
  const to = {
    x: end.x - (horizontal ? sign * 10 : 0),
    y: end.y - (horizontal ? 0 : sign * 10),
  };
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

export function graphLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  width: number,
  measure: (node: DiagramNode, width: number) => number,
  direction = "down",
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
  const boxes: Box[] = [];
  let y = 24;
  if (right) {
    const count = layers.size,
      boxWidth = Math.min(190, (width - 48 - (count - 1) * 64) / count);
    if (boxWidth >= 100)
      for (const [level, indices] of layers) {
        let top = 24;
        for (const i of indices) {
          boxes[i] = {
            x:
              (width - count * boxWidth - (count - 1) * 64) / 2 +
              level * (boxWidth + 64),
            y: top,
            width: boxWidth,
            height: measure(nodes[i], boxWidth),
          };
          top += boxes[i].height + 48;
        }
        y = Math.max(y, top);
      }
    if (boxes.length) {
      const bottom = Math.max(...boxes.map((box) => box.y + box.height));
      for (const indices of layers.values()) {
        const last = boxes[indices[indices.length - 1]];
        const offset = (bottom - last.y - last.height) / 2;
        for (const i of indices) boxes[i].y += offset;
      }
    }
  }
  if (!boxes.length) {
    const columns = Math.max(1, Math.floor((width - 32) / 210));
    for (const [, indices] of [...layers].sort((a, b) => a[0] - b[0]))
      for (let row = 0; row < indices.length; row += columns) {
        const group = indices.slice(row, row + columns),
          boxWidth = Math.min(
            210,
            (width - 48 - (group.length - 1) * 40) / group.length,
          );
        const left =
          (width - group.length * boxWidth - (group.length - 1) * 40) / 2;
        for (const [column, i] of group.entries())
          boxes[i] = {
            x: left + column * (boxWidth + 40),
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
  const indices = new Map(nodes.map((node, i) => [node.id, i]));
  return {
    nodes: boxes,
    height,
    edges: edges.map((edge, i) =>
      route(
        boxes[indices.get(edge.from) ?? 0],
        boxes[indices.get(edge.to) ?? 0],
        boxes,
        width,
        height,
        right,
        i,
      ),
    ),
  };
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
