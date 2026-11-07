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
  const forward = right ? b.x > a.x : b.y > a.y;
  const start =
    right && forward
      ? { x: a.x + a.width, y: a.y + a.height / 2 }
      : forward
        ? { x: a.x + a.width / 2, y: a.y + a.height }
        : { x: a.x, y: a.y + a.height / 2 };
  const end =
    right && forward
      ? { x: b.x, y: b.y + b.height / 2 }
      : forward
        ? { x: b.x + b.width / 2, y: b.y }
        : { x: b.x, y: b.y + b.height / 2 };
  const from =
    right && forward
      ? { x: start.x + 10, y: start.y }
      : forward
        ? { x: start.x, y: start.y + 10 }
        : { x: start.x - 10, y: start.y };
  const to =
    right && forward
      ? { x: end.x - 10, y: end.y }
      : forward
        ? { x: end.x, y: end.y - 10 }
        : { x: end.x - 10, y: end.y };
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
  heights: number[],
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
            height: heights[i],
          };
          top += heights[i] + 48;
        }
        y = Math.max(y, top);
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
            height: heights[i],
          };
        y += Math.max(...group.map((i) => heights[i])) + 74;
      }
  }
  const height = Math.max(160, y + 24);
  for (const [i, node] of nodes.entries()) {
    if (node.x !== undefined)
      boxes[i].x = 24 + node.x * Math.max(0, width - boxes[i].width - 48);
    if (node.y !== undefined)
      boxes[i].y = 24 + node.y * Math.max(0, height - boxes[i].height - 48);
  }
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
