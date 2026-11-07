import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "darwin") {
  console.log("The native application menu check requires macOS.");
} else {
  const directory = mkdtempSync(join(tmpdir(), "visualize-menu-"));
  try {
    const executable = join(directory, "menu");
    execFileSync(
      "xcrun",
      [
        "clang++",
        "-std=c++17",
        "-fobjc-arc",
        "-Inative",
        "-I.cache/deps/cimgui",
        "-I.cache/deps/cimplot",
        "tests/native/menu.mm",
        "-L.cache/native",
        "-lvisualize",
        `-Wl,-rpath,${resolve(".cache/native")}`,
        "-framework",
        "Cocoa",
        "-o",
        executable,
      ],
      { stdio: "inherit", timeout: 120_000 },
    );
    execFileSync(executable, [], { stdio: "inherit", timeout: 15_000 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
