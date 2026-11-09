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
  const { bars } = waterfall([
    { value: 100, kind: "total" },
    { value: 20 },
    { value: -45 },
    { value: 75, kind: "total" },
    { value: -10 },
  ]);
  assert.deepEqual(
    bars.map(({ start, end }) => ({ start, end })),
    [
      { start: 0, end: 100 },
      { start: 100, end: 120 },
      { start: 120, end: 75 },
      { start: 0, end: 75 },
      { start: 75, end: 65 },
    ],
  );
});

test("waterfall bars are grouped and labelled by direction", () => {
  const { bars } = waterfall([
    { value: 12, kind: "total" },
    { value: 5 },
    { value: -21 },
    { value: -4, kind: "total" },
    { value: 0 },
  ]);
  assert.deepEqual(
    bars.map(({ group, label, below }) => ({ group, label, below })),
    [
      { group: "total", label: "12", below: false },
      { group: "increase", label: "+5", below: false },
      { group: "decrease", label: "-21", below: true },
      { group: "total", label: "-4", below: true },
      { group: "increase", label: "0", below: false },
    ],
  );
});

test("waterfall bounds leave room for labels beyond the bars", () => {
  const { low, high } = waterfall([{ value: 10 }, { value: -15 }]);
  assert.ok(low < -5, "a decrease label below the lowest bar needs room");
  assert.ok(high > 10, "an increase label above the highest bar needs room");
  assert.equal(waterfall([{ value: 4 }, { value: 6 }]).low, 0);
});
