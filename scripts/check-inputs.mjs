import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "visualize-inputs-"));
const libraries = resolve("dist/lib");
const mac = process.platform === "darwin";
try {
  const executable = join(scratch, "inputs");
  execFileSync(
    mac ? "xcrun" : (process.env.CXX ?? "c++"),
    [
      ...(mac ? ["clang++"] : []),
      "-std=c++20",
      "-Inative",
      "-I.cache/deps/cimgui",
      "-I.cache/deps/cimplot",
      "tests/native/inputs.cpp",
      ...(mac ? [] : ["-ldl"]),
      "-o",
      executable,
    ],
    { stdio: "inherit", timeout: 120_000 },
  );
  execFileSync(
    executable,
    [join(libraries, mac ? "libvisualize.dylib" : "libvisualize.so.0")],
    {
      stdio: "inherit",
      timeout: 30_000,
      env: {
        ...process.env,
        ...(mac
          ? { DYLD_LIBRARY_PATH: libraries }
          : { XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? scratch }),
      },
    },
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
