import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { PNG } from "pngjs";

export function pdfPages(file, output) {
  execFileSync(
    "pdftoppm",
    ["-png", "-r", "96", "-aa", "yes", "-aaVector", "yes", file, output],
    { timeout: 60_000, stdio: "pipe" },
  );
  const prefix = basename(output);
  return readdirSync(dirname(output))
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((name) => join(dirname(output), name));
}

export function artifactViewport(file, canvas, scale) {
  const source = PNG.sync.read(readFileSync(file.output));
  const x = Math.round(canvas.x * scale),
    y = Math.round(canvas.y * scale),
    width = Math.round(canvas.width * scale),
    height = Math.round(canvas.height * scale);
  if (x < 0 || y < 0 || x + width > source.width || y + height > source.height)
    throw new Error(
      "The reported artifact viewport is outside the captured frame",
    );
  const output = new PNG({ width, height });
  PNG.bitblt(source, output, x, y, width, height, 0, 0);
  return PNG.sync.write(output);
}
