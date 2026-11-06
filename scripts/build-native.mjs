import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "darwin")
  throw new Error("The native viewer currently builds on macOS.");
const deps = join(root, ".cache/deps");
mkdirSync(deps, { recursive: true });
const lock = JSON.parse(
  readFileSync(join(root, "native/dependencies.json"), "utf8"),
);
const architecture = process.arch === "arm64" ? "aarch64" : "x86_64";
lock.wgpu = {
  url: `https://github.com/gfx-rs/wgpu-native/releases/download/v29.0.1.1/wgpu-macos-${architecture}-release.zip`,
  kind: "zip",
  sha256:
    process.arch === "arm64"
      ? "a5797a37b1adf720bcd5dcffb291edbbd5b7b14be0a3874c28e6393a655a7a3e"
      : "8e2f7378548ddd0e2cf21e7d864dda46e953f0af724855a33778b85ead206d41",
};

for (const [name, entry] of Object.entries(lock)) {
  const destination = join(deps, name);
  const marker =
    entry.kind === "header"
      ? `${destination}.sha256`
      : join(destination, ".sha256");
  if (existsSync(marker) && readFileSync(marker, "utf8") === entry.sha256)
    continue;
  const archive = join(deps, `${name}.download`);
  if (
    !existsSync(archive) ||
    createHash("sha256").update(readFileSync(archive)).digest("hex") !==
      entry.sha256
  ) {
    console.error(`Downloading ${name}`);
    const response = await fetch(entry.url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`${entry.url}: HTTP ${response.status}`);
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  }
  if (
    createHash("sha256").update(readFileSync(archive)).digest("hex") !==
    entry.sha256
  ) {
    rmSync(archive);
    throw new Error(`Checksum mismatch for ${name}`);
  }
  if (entry.kind === "header") renameSync(archive, destination);
  else {
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    if (entry.kind === "zip")
      execFileSync("unzip", ["-q", archive, "-d", destination]);
    else
      execFileSync("tar", [
        "-xzf",
        archive,
        "--strip-components=1",
        "-C",
        destination,
      ]);
    rmSync(archive);
  }
  writeFileSync(marker, entry.sha256);
}

for (const [binding, library] of [
  ["cimgui", "imgui"],
  ["cimplot", "implot"],
]) {
  const directory = join(deps, binding);
  const source = join(directory, library);
  if (!existsSync(join(source, `${library}.h`))) {
    rmSync(source, { recursive: true, force: true });
    symlinkSync(join(deps, library), source);
  }
}

const prefix = execFileSync("brew", ["--prefix", "sdl3"], {
  encoding: "utf8",
}).trim();
execFileSync(
  "cmake",
  [
    "-S",
    join(root, "native"),
    "-B",
    join(root, ".cache/native"),
    "-DCMAKE_BUILD_TYPE=Release",
    `-DCMAKE_PREFIX_PATH=${prefix}`,
  ],
  { stdio: "inherit", timeout: 300_000 },
);
execFileSync(
  "cmake",
  ["--build", join(root, ".cache/native"), "--parallel", "4"],
  { stdio: "inherit" },
);
