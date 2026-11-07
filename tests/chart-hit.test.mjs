import assert from "node:assert/strict";
import { test } from "node:test";
import { barAt } from "../src/ui/chart-hit.ts";

const plot = (x, y) => ({ x: new Float64Array(x), y: new Float64Array(y) });
const series = (x, values) => ({ name: "Observations", x, values });

test("bar selection follows sparse category coordinates rather than point order", () => {
  const source = [series([2, 0], [8, 5]), series([1], [6])];
  const rendered = [plot([1.8, -0.2], [8, 5]), plot([1.2], [6])];
  for (const [x, y, expected] of [
    [1.8, 4, 2],
    [-0.2, 3, 0],
    [1.2, 3, 1],
  ])
    assert.equal(barAt(rendered, source, [], { x, y }, 0.4), expected);
  assert.equal(barAt(rendered, source, [], { x: 0.5, y: 3 }, 0.4), undefined);
});

test("negative bars select only within their rendered extent", () => {
  const source = [series([0], [-8])],
    rendered = [plot([0], [-8])];
  for (const [x, y, expected] of [
    [0, -4, 0],
    [0, 2, undefined],
    [0.6, -4, undefined],
    [0, -9, undefined],
  ])
    assert.equal(barAt(rendered, source, [], { x, y }, 0.8), expected);
});

test("hidden series cannot intercept selection of a visible bar", () => {
  const source = [series([3], [8]), series([7], [10])];
  const rendered = [plot([0], [8]), plot([0], [10])];
  assert.equal(barAt(rendered, source, [], { x: 0, y: 4 }, 0.8), 7);
  assert.equal(barAt(rendered, source, [false, true], { x: 0, y: 4 }, 0.8), 3);
  assert.equal(
    barAt(rendered, source, [true, true], { x: 0, y: 4 }, 0.8),
    undefined,
  );
});

test("zero bars have a bounded vertical hit tolerance", () => {
  const source = [series([4], [0])],
    rendered = [plot([4], [0])];
  assert.equal(barAt(rendered, source, [], { x: 4, y: 0.1 }, 0.8, 0.2), 4);
  assert.equal(
    barAt(rendered, source, [], { x: 4, y: 0.3 }, 0.8, 0.2),
    undefined,
  );
});
