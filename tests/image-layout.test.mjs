import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutImage } from "../src/ui/image-layout.ts";

test("natural images shrink to their container without upscaling", () => {
  for (const [naturalWidth, naturalHeight, available, width, height] of [
    [256, 128, 1024, 256, 128],
    [1024, 512, 256, 256, 128],
    [1, 1, 480, 1, 1],
    [1024, 512, -10, 1, 0.5],
  ]) {
    const result = layoutImage(naturalWidth, naturalHeight, available);
    assert.equal(result.width, width);
    assert.equal(result.height, height);
    assert.deepEqual(result.image, { x: 0, y: 0, width, height });
    assert.deepEqual(result.uv0, { x: 0, y: 0 });
    assert.deepEqual(result.uv1, { x: 1, y: 1 });
    if (Math.min(width, height) < 2) assert.equal(result.rounding, 0);
  }
});

test("contain keeps the whole image centered within the requested frame", () => {
  for (const [naturalWidth, naturalHeight, image] of [
    [1024, 256, { x: 0, y: 64, width: 512, height: 128 }],
    [256, 1024, { x: 224, y: 0, width: 64, height: 256 }],
    [1024, 512, { x: 0, y: 0, width: 512, height: 256 }],
  ]) {
    const result = layoutImage(naturalWidth, naturalHeight, 512, 256);
    assert.deepEqual(result.image, image);
    assert.deepEqual(result.uv0, { x: 0, y: 0 });
    assert.deepEqual(result.uv1, { x: 1, y: 1 });
  }
});

test("cover crops the long axis symmetrically without stretching the image", () => {
  for (const [naturalWidth, naturalHeight, uv0, uv1] of [
    [1024, 256, { x: 0.25, y: 0 }, { x: 0.75, y: 1 }],
    [256, 1024, { x: 0, y: 0.4375 }, { x: 1, y: 0.5625 }],
    [1024, 512, { x: 0, y: 0 }, { x: 1, y: 1 }],
  ]) {
    const result = layoutImage(naturalWidth, naturalHeight, 512, 256, "cover");
    assert.deepEqual(result.image, { x: 0, y: 0, width: 512, height: 256 });
    assert.deepEqual(result.uv0, uv0);
    assert.deepEqual(result.uv1, uv1);
  }
});
