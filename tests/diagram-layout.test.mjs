import assert from "node:assert/strict";
import { test } from "node:test";
import { edgeLabelLayout, graphLayout } from "../src/ui/diagram-layout.ts";

test("automatic connectors avoid intervening nodes in narrow and wide graphs", () => {
  const nodes = ["start", "first", "second", "end"].map((id) => ({
    id,
    label: id,
  }));
  const edges = [
    { from: "start", to: "first" },
    { from: "first", to: "second" },
    { from: "second", to: "end" },
    { from: "start", to: "end" },
    { from: "end", to: "first" },
  ];
  for (const width of [310, 720, 1200])
    for (const direction of ["down", "right"]) {
      const layout = graphLayout(nodes, edges, width, () => 60, direction);
      for (const box of layout.nodes) {
        assert.ok(box.x >= 0 && box.x + box.width <= width);
        assert.ok(box.y >= 0 && box.y + box.height <= layout.height);
      }
      for (const [i, path] of layout.edges.entries()) {
        for (let p = 1; p < path.length; p++) {
          const a = path[p - 1],
            b = path[p];
          assert.ok(
            a.x === b.x || a.y === b.y,
            "connector segments stay orthogonal",
          );
          for (const [j, box] of layout.nodes.entries()) {
            if (nodes[j].id === edges[i].from || nodes[j].id === edges[i].to)
              continue;
            const crosses =
              a.x === b.x
                ? a.x > box.x &&
                  a.x < box.x + box.width &&
                  Math.max(a.y, b.y) > box.y &&
                  Math.min(a.y, b.y) < box.y + box.height
                : a.y > box.y &&
                  a.y < box.y + box.height &&
                  Math.max(a.x, b.x) > box.x &&
                  Math.min(a.x, b.x) < box.x + box.width;
            assert.equal(crosses, false, `connector intersects ${nodes[j].id}`);
          }
        }
      }
    }
});

test("self transitions have a visible route that returns to the state", () => {
  const layout = graphLayout(
    [{ id: "waiting", label: "Waiting" }],
    [{ from: "waiting", to: "waiting" }],
    360,
    () => 60,
  );
  const route = layout.edges[0];
  assert.ok(route.length >= 4);
  assert.notDeepEqual(route[0], route.at(-1));
  assert.ok(
    route.every(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    ),
  );
});

test("diagram node heights use their final width and unequal columns align at the center", () => {
  const nodes = [
    { id: "first", label: "First" },
    { id: "second", label: "Second" },
    { id: "third", label: "Third" },
  ];
  const widths = new Map();
  const layout = graphLayout(
    nodes,
    [
      { from: "first", to: "third" },
      { from: "second", to: "third" },
    ],
    720,
    (node, width) => {
      widths.set(node.id, width);
      return node.id === "second" ? 160 : 60;
    },
    "right",
  );
  for (const [i, node] of nodes.entries())
    assert.equal(layout.nodes[i].width, widths.get(node.id));
  const [first, second, third] = layout.nodes;
  assert.equal(
    (first.y + second.y + second.height) / 2,
    third.y + third.height / 2,
  );
});

test("connector labels remain outside nodes and other labels across responsive layouts", () => {
  const nodes = ["start", "left", "right", "end"].map((id) => ({
    id,
    label: id,
  }));
  const edges = [
    { from: "start", to: "left" },
    { from: "start", to: "right" },
    { from: "left", to: "end" },
    { from: "right", to: "end" },
  ];
  const overlaps = (a, b) =>
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
  for (const width of [310, 720, 1200]) {
    const layout = graphLayout(nodes, edges, width, () => 60);
    const labels = edgeLabelLayout(
      layout,
      width,
      edges.map(() => ({ width: 140, height: 36 })),
    );
    const occupied = [...layout.nodes];
    for (const box of labels.boxes) {
      assert.ok(box);
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(box.y >= 0 && box.y + box.height <= labels.height);
      assert.equal(
        occupied.some((other) => overlaps(box, other)),
        false,
      );
      occupied.push(box);
    }
  }
});

test("explicit diagram positions fall back to readable automatic placement when narrow", () => {
  const nodes = [
    { id: "first", label: "First", x: 0, y: 0 },
    { id: "second", label: "Second", x: 0.5, y: 0 },
    { id: "third", label: "Third", x: 1, y: 0 },
    { id: "end", label: "End", x: 0.5, y: 1 },
  ];
  const edges = nodes.slice(0, 3).map((node) => ({ from: node.id, to: "end" }));
  for (const width of [310, 720, 1280]) {
    const layout = graphLayout(nodes, edges, width, () => 60);
    for (let i = 0; i < layout.nodes.length; i++)
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i],
          b = layout.nodes[j];
        assert.ok(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        );
      }
  }
});
