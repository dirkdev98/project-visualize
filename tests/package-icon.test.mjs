import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("the macOS application names a decodable icon with small and Retina artwork", {
  skip: process.platform !== "darwin",
}, (t) => {
  const app = resolve("dist/Project Visualize.app/Contents");
  const name = execFileSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleIconFile", join(app, "Info.plist")],
    { encoding: "utf8" },
  ).trim();
  const scratch = mkdtempSync(join(tmpdir(), "visualize-icon-check-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const iconset = join(scratch, "decoded.iconset");
  execFileSync(
    "iconutil",
    ["--convert", "iconset", "--output", iconset, join(app, "Resources", name)],
    { timeout: 30_000 },
  );
  const sizes = readdirSync(iconset)
    .filter((file) => file.endsWith(".png"))
    .map((file) => {
      const image = readFileSync(join(iconset, file));
      assert.equal(image.readUInt32BE(16), image.readUInt32BE(20));
      return image.readUInt32BE(16);
    });
  assert.ok(sizes.includes(16));
  assert.ok(sizes.includes(1024));
});
