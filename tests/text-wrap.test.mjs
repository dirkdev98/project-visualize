import assert from "node:assert/strict";
import { test } from "node:test";
import { wrap } from "../src/html/markup.ts";

for (const [name, value, width, expected] of [
  ["words that exactly fit", "alpha beta", 10, ["alpha beta"]],
  ["a following word", "alpha beta gamma", 10, ["alpha beta", "gamma"]],
  ["long identifiers", "abcdefghijk", 4, ["abcd", "efgh", "ijk"]],
  ["explicit blank lines", "alpha\n\nbeta", 5, ["alpha", "", "beta"]],
  ["Unicode characters", "😀 😀", 3, ["😀 😀"]],
  ["entity field types", "FK id: string", 13, ["FK id: string"]],
])
  test(`text wrapping preserves ${name}`, () => {
    const lines = wrap(value, width, 1, (text) => Array.from(text).length);
    assert.deepEqual(
      lines.map((line) => line.trimEnd()),
      expected,
    );
  });
