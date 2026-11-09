import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const name = process.argv[2];
if (
  ![
    "readback",
    "images",
    "plots",
    "selection",
    "navigation",
    "bindings",
  ].includes(name)
)
  throw new Error(
    "Choose a native probe: readback, images, plots, selection, navigation or bindings",
  );
const scratch = mkdtempSync(join(tmpdir(), `visualize-${name}-`));
const compiler = resolve("node_modules/.bin/maligator");
const entry = `tests/native/${name}.js`;
function run(file, args, mode) {
  const output = join(scratch, `${mode}.png`);
  try {
    execFileSync(file, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        VISUALIZE_NATIVE_CHECK_OUTPUT: output,
        ...(process.platform === "linux" && !process.env.XDG_RUNTIME_DIR
          ? { XDG_RUNTIME_DIR: scratch }
          : {}),
      },
      killSignal: "SIGKILL",
      detached: true,
    });
  } catch (error) {
    // Stop the compiler's children when its launcher fails.
    if (error.pid) {
      try {
        process.kill(-error.pid, "SIGKILL");
      } catch {}
    }
    throw error;
  }
  if (!mode) return;
  const png = readFileSync(output);
  if (png.readUInt32BE(16) !== 481 || png.readUInt32BE(20) !== 160)
    throw new Error("The encoded PNG did not retain the captured dimensions");
}
try {
  if (!process.argv.includes("--production"))
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
