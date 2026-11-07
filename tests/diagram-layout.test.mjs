import assert from "node:assert/strict";
import { test } from "node:test";
import { graphLayout } from "../src/ui/diagram-layout.ts";

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
      const layout = graphLayout(
        nodes,
        edges,
        width,
        nodes.map(() => 60),
        direction,
      );
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
    [60],
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
