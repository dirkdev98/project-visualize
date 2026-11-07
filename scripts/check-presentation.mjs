import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const libraries = join(root, "dist/lib");
const library = join(libraries, "libvisualize.dylib");
if (!existsSync(library))
  throw new Error("Run npm run build before the native presentation check");
const scratch = mkdtempSync(join(tmpdir(), "visualize-presentation-"));
try {
  const sdl = execFileSync("brew", ["--prefix", "sdl3"], {
    encoding: "utf8",
  }).trim();
  const executable = join(scratch, "presentation");
  execFileSync(
    "xcrun",
    [
      "clang++",
      "-std=c++20",
      `-I${join(root, "native")}`,
      `-I${join(root, ".cache/deps/cimgui")}`,
      `-I${join(root, ".cache/deps/cimplot")}`,
      `-I${join(sdl, "include")}`,
      join(root, "tests/native/presentation.cpp"),
      "-o",
      executable,
    ],
    { stdio: "inherit", timeout: 120_000 },
  );
  const result = spawnSync(executable, [library], {
    env: { ...process.env, DYLD_LIBRARY_PATH: libraries },
    stdio: "inherit",
    timeout: 15_000,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(scratch, { recursive: true });
}
