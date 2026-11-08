import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "assets/app-icons");
mkdirSync(output, { recursive: true });
function png(size, destination) {
  execFileSync(
    "rsvg-convert",
    [
      "--width",
      String(size),
      "--height",
      String(size),
      "--output",
      destination,
      join(root, "assets/icon.svg"),
    ],
    { timeout: 30_000 },
  );
}
for (const size of [16, 32, 48, 64, 128, 256, 512, 1024])
  png(size, join(output, `${size}.png`));
if (process.platform !== "darwin")
  throw new Error("Generate the macOS icon on macOS with iconutil.");
const scratch = mkdtempSync(join(tmpdir(), "visualize-icons-"));
try {
  const iconset = join(scratch, "visualize.iconset");
  mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512])
    for (const scale of [1, 2])
      png(
        size * scale,
        join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`),
      );
  execFileSync(
    "iconutil",
    ["--convert", "icns", "--output", join(output, "visualize.icns"), iconset],
    { timeout: 30_000 },
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
