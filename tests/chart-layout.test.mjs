import assert from "node:assert/strict";
import { test } from "node:test";
import { crowdedCategories } from "../src/ui/chart-layout.ts";

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
