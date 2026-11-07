import assert from "node:assert/strict";
import { test } from "node:test";
import { pageBottom } from "../src/ui/layout.ts";

test("page boundaries consume the remaining content without a trailing page", () => {
  for (const [top, height, capacity, expected] of [
    [0, 80, 100, 80],
    [0, 200, 100, 100],
    [100, 200, 100, 200],
    [200, 230, 100, 230],
  ])
    assert.equal(pageBottom(top, height, capacity, []), expected);
});

test("a chart that fits on a page moves intact to the next page", () => {
  const regions = [
    { top: 80, bottom: 130 },
    { top: 140, bottom: 170 },
    { top: 180, bottom: 210 },
  ];
  assert.equal(pageBottom(0, 230, 100, regions), 80);
  assert.equal(pageBottom(80, 230, 100, regions), 180);
});

test("an oversized block splits while its individual lines stay intact", () => {
  const regions = [{ top: 0, bottom: 250 }];
  const lines = [{ top: 90, bottom: 110 }];
  assert.equal(pageBottom(0, 280, 100, regions, lines), 90);
  assert.equal(pageBottom(90, 280, 100, regions, lines), 190);
});

test("overlapping protected regions share a safe page boundary", () => {
  assert.equal(
    pageBottom(0, 150, 100, [
      { top: 80, bottom: 130 },
      { top: 60, bottom: 90 },
    ]),
    60,
  );
});

test("conflicting row preferences yield to intact text lines", () => {
  assert.equal(
    pageBottom(
      0,
      170,
      100,
      [
        { top: 0, bottom: 60 },
        { top: 50, bottom: 110 },
      ],
      [{ top: 85, bottom: 105 }],
    ),
    85,
  );
});

test("a page fails when no boundary can preserve the text", () => {
  assert.throws(
    () => pageBottom(0, 200, 100, [], [{ top: 0, bottom: 120 }]),
    /No safe PDF page break/,
  );
});
