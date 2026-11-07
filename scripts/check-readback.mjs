import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "visualize-readback-"));
const compiler = resolve("node_modules/.bin/maligator");
const entry = "tests/native/readback.js";
function run(file, args, mode) {
  const output = join(scratch, `${mode}.png`);
  execFileSync(file, args, {
    stdio: "inherit",
    timeout: 300_000,
    env: { ...process.env, VISUALIZE_READBACK_OUTPUT: output },
  });
  if (!mode) return;
  const png = readFileSync(output);
  if (png.readUInt32BE(16) !== 481 || png.readUInt32BE(20) !== 160)
    throw new Error("The encoded PNG did not retain the captured dimensions");
}
try {
  run(compiler, ["run", entry], "development");
  run(compiler, [
    "build",
    entry,
    "--production",
    "--artifact",
    join(scratch, "release"),
  ]);
  run(join(scratch, "release/bin/visualize"), [], "production");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
