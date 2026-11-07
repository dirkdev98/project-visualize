import assert from "node:assert/strict";
import { test } from "node:test";
import { paginate } from "../src/ui/layout.ts";

test("pagination preserves all content without an empty trailing page", () => {
  for (const [height, capacity, expected] of [
    [80, 100, [{ top: 0, bottom: 80 }]],
    [
      200,
      100,
      [
        { top: 0, bottom: 100 },
        { top: 100, bottom: 200 },
      ],
    ],
    [
      230,
      100,
      [
        { top: 0, bottom: 100 },
        { top: 100, bottom: 200 },
        { top: 200, bottom: 230 },
      ],
    ],
  ])
    assert.deepEqual(paginate(height, capacity, []), expected);
});

test("a chart that fits on a page moves intact to the next page", () => {
  assert.deepEqual(
    paginate(230, 100, [
      { top: 80, bottom: 130 },
      { top: 140, bottom: 170 },
      { top: 180, bottom: 210 },
    ]),
    [
      { top: 0, bottom: 80 },
      { top: 80, bottom: 180 },
      { top: 180, bottom: 230 },
    ],
  );
});

test("an oversized block splits while its individual lines stay intact", () => {
  assert.deepEqual(
    paginate(280, 100, [
      { top: 0, bottom: 250 },
      { top: 90, bottom: 110 },
    ]),
    [
      { top: 0, bottom: 90 },
      { top: 90, bottom: 190 },
      { top: 190, bottom: 280 },
    ],
  );
});

test("overlapping protected regions share a safe page boundary", () => {
  assert.deepEqual(
    paginate(150, 100, [
      { top: 80, bottom: 130 },
      { top: 60, bottom: 90 },
    ]),
    [
      { top: 0, bottom: 60 },
      { top: 60, bottom: 150 },
    ],
  );
});
