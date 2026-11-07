import assert from "node:assert/strict";
import { test } from "node:test";
import { boxplot, histogram, waterfall } from "../src/ui/statistics.ts";

test("histograms use shared bins and retain observations at both boundaries", () => {
  const result = histogram(
    [
      [0, 1, 2, 3, 4],
      [0, 0, 4],
    ],
    2,
  );
  assert.deepEqual(result.boundaries, [0, 2, 4]);
  assert.deepEqual(result.counts, [
    [2, 3],
    [2, 1],
  ]);
  for (const values of [[7], [0, 0, 0], [-12, -12]]) {
    const constant = histogram([values], 4);
    assert.equal(
      constant.counts[0].reduce((a, b) => a + b, 0),
      values.length,
    );
    assert.ok(constant.boundaries[0] < values[0]);
    assert.ok(constant.boundaries.at(-1) > values[0]);
  }
});

test("box plots use interpolated quartiles and observed Tukey whiskers", () => {
  const input = [100, 4, 3, 2, 1, 0];
  assert.deepEqual(boxplot(input), {
    q1: 1.25,
    median: 2.5,
    q3: 3.75,
    low: 0,
    high: 4,
    outliers: [100],
    count: 6,
  });
  assert.deepEqual(input, [100, 4, 3, 2, 1, 0]);
  assert.deepEqual(boxplot([-4]), {
    q1: -4,
    median: -4,
    q3: -4,
    low: -4,
    high: -4,
    outliers: [],
    count: 1,
  });
  assert.equal(boxplot([]), undefined);
});

test("waterfall totals reset the baseline while signed deltas accumulate", () => {
  assert.deepEqual(
    waterfall([
      { value: 100, kind: "total" },
      { value: 20 },
      { value: -45 },
      { value: 75, kind: "total" },
      { value: -10 },
    ]),
    [
      { start: 0, end: 100 },
      { start: 100, end: 120 },
      { start: 120, end: 75 },
      { start: 0, end: 75 },
      { start: 75, end: 65 },
    ],
  );
});
