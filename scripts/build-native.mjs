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
if (!["darwin", "linux"].includes(process.platform))
  throw new Error("Build on macOS or Linux.");
if (!["arm64", "x64"].includes(process.arch))
  throw new Error("Build on an x64 or ARM64 machine.");
const deps = join(root, ".cache/deps");
mkdirSync(deps, { recursive: true });
const lock = JSON.parse(
  readFileSync(join(root, "native/dependencies.json"), "utf8"),
);
const architecture = process.arch === "arm64" ? "aarch64" : "x86_64";
const wgpuChecksums = {
  "darwin-arm64":
    "a5797a37b1adf720bcd5dcffb291edbbd5b7b14be0a3874c28e6393a655a7a3e",
  "darwin-x64":
    "8e2f7378548ddd0e2cf21e7d864dda46e953f0af724855a33778b85ead206d41",
  "linux-x64":
    "95a4d90c071005a98d03eab348beaa6b07e16eb00d1dcdb9f8348f75eb97ec5a",
  "linux-arm64":
    "015fcdf1dbae82e614a783cc38017e5399ae0927a889fe9b69c9b664bc61b47a",
};
lock.wgpu = {
  url: `https://github.com/gfx-rs/wgpu-native/releases/download/v29.0.1.1/wgpu-${process.platform === "darwin" ? "macos" : "linux"}-${architecture}-release.zip`,
  kind: "zip",
  sha256: wgpuChecksums[`${process.platform}-${process.arch}`],
};
if (process.platform === "darwin") delete lock.sdl;

function run(file, args) {
  execFileSync(file, args, { stdio: "inherit", timeout: 300_000 });
}

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

let prefix;
if (process.platform === "darwin")
  prefix = execFileSync("brew", ["--prefix", "sdl3"], {
    encoding: "utf8",
  }).trim();
else {
  prefix = join(root, ".cache/sdl");
  const build = join(root, ".cache/sdl-build");
  run("cmake", [
    "-S",
    join(deps, "sdl"),
    "-B",
    build,
    "-DCMAKE_BUILD_TYPE=Release",
    `-DCMAKE_INSTALL_PREFIX=${prefix}`,
    "-DCMAKE_INSTALL_LIBDIR=lib",
    "-DSDL_SHARED=ON",
    "-DSDL_STATIC=OFF",
    "-DSDL_TESTS=OFF",
    "-DSDL_TEST_LIBRARY=OFF",
    "-DSDL_DEPS_SHARED=OFF",
    "-DSDL_X11=ON",
    "-DSDL_WAYLAND=ON",
    "-DSDL_AUDIO=OFF",
    "-DSDL_CAMERA=OFF",
    "-DSDL_JOYSTICK=OFF",
    "-DSDL_HAPTIC=OFF",
    "-DSDL_SENSOR=OFF",
  ]);
  run("cmake", ["--build", build, "--parallel", "4"]);
  run("cmake", ["--install", build]);
}
run("cmake", [
  "-S",
  join(root, "native"),
  "-B",
  join(root, ".cache/native"),
  "-DCMAKE_BUILD_TYPE=Release",
  `-DCMAKE_PREFIX_PATH=${prefix}`,
]);
run("cmake", ["--build", join(root, ".cache/native"), "--parallel", "4"]);
