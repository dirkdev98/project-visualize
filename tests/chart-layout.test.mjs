import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chartBounds,
  chartTicks,
  crowdedCategories,
} from "../src/ui/chart-layout.ts";

test("categorical bars change orientation when adjacent labels would overlap", () => {
  assert.equal(crowdedCategories(Array(17).fill(110), 1100), true);
  assert.equal(crowdedCategories(Array(17).fill(110), 2300), false);
  assert.equal(crowdedCategories([40, 50, 30, 60], 600), false);
});

test("an isolated long label does not force a wider neighbor to overlap", () => {
  assert.equal(crowdedCategories([180, 20, 20], 600), false);
  assert.equal(crowdedCategories([180, 180, 20], 600), true);
});

test("a category wider than its whole plot uses the alternate layout", () => {
  assert.equal(crowdedCategories([300], 200), true);
  assert.equal(crowdedCategories([], 0), false);
});

test("whole-number data keeps whole-number ticks", () => {
  assert.deepEqual(chartTicks(0, 2.2), [0, 0.5, 1, 1.5, 2]);
  assert.deepEqual(chartTicks(0, 2.2, true), [0, 1, 2]);
  assert.equal(chartBounds([{ x: 0, y: 2 }], "bar").yWhole, true);
  assert.equal(chartBounds([{ x: 0, y: 2.5 }], "bar").yWhole, false);
});

test("a single bar keeps room on both sides and a flush zero baseline", () => {
  const { xmin, xmax, ymin } = chartBounds([{ x: 0, y: 7 }], "bar");
  assert.ok(xmin < -0.4 && xmax > 0.4, "the bar does not touch the frame");
  assert.equal(ymin, 0);
});
