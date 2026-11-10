import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bundleVersion,
  debianVersion,
  releaseVersion,
} from "../scripts/release-version.mjs";

const root = new URL("..", import.meta.url).pathname;

test("release builds take the workflow version over package.json", () => {
  assert.equal(
    releaseVersion(root, { VISUALIZE_VERSION: "2026.01.1" }),
    "2026.01.1",
  );
  assert.match(releaseVersion(root, {}), /^\d+\.\d+\.\d+/);
});

test("a malformed version stops the build", () => {
  for (const version of ["2026.11", "v2026.11.0", "2026.11.0-", "latest"])
    assert.throws(() => releaseVersion(root, { VISUALIZE_VERSION: version }));
});

test("platform versions keep an alpha ordered before its release", () => {
  assert.equal(bundleVersion("2026.11.0-alpha.7"), "2026.11.0");
  assert.equal(debianVersion("2026.11.0-alpha.7"), "2026.11.0~alpha.7");
  assert.equal(debianVersion("2026.01.1"), "2026.01.1");
});
