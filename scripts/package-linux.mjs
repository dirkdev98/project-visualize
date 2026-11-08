import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyResources, writeChecksums } from "./package-resources.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(root, "dist");
const source = join(root, ".cache/release");
const version = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version;
const architecture = process.arch === "x64" ? "amd64" : "arm64";
if (!["x64", "arm64"].includes(process.arch))
  throw new Error("Package on x64 or ARM64 Linux.");
if (!existsSync(join(source, "bin/visualize")))
  throw new Error("Build the release artifact first.");
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    timeout: 300_000,
    ...options,
  });
}

rmSync(release, { recursive: true, force: true });
mkdirSync(join(release, "bin"), { recursive: true });
mkdirSync(join(release, "lib"), { recursive: true });
const executable = join(release, "bin/visualize");
copyFileSync(join(source, "bin/visualize"), executable);
const libraries = [
  [join(root, ".cache/native/libvisualize.so.0"), "libvisualize.so.0"],
  [join(root, ".cache/deps/wgpu/lib/libwgpu_native.so"), "libwgpu_native.so.0"],
  [join(root, ".cache/sdl/lib/libSDL3.so.0"), "libSDL3.so.0"],
];
for (const [file, name] of libraries) {
  const output = join(release, "lib", name);
  copyFileSync(file, output);
  run("patchelf", ["--set-soname", name, output]);
}
const binaries = [
  executable,
  ...libraries.map(([, name]) => join(release, "lib", name)),
];
function normalizeModes(directory) {
  chmodSync(directory, 0o755);
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, file.name);
    if (file.isDirectory()) normalizeModes(location);
    else if (!file.isSymbolicLink()) chmodSync(location, 0o644);
  }
}
for (const file of binaries) {
  const needed = run("patchelf", ["--print-needed", file]).trim().split("\n");
  for (const dependency of needed) {
    const privateLibrary = libraries.find(
      ([original, name]) =>
        basename(dependency) === basename(original) ||
        basename(dependency) === name,
    );
    if (privateLibrary && dependency !== privateLibrary[1])
      run("patchelf", [
        "--replace-needed",
        dependency,
        privateLibrary[1],
        file,
      ]);
    else if (dependency.startsWith("/"))
      throw new Error(
        `Unbundled absolute dependency in ${file}: ${dependency}`,
      );
  }
  run("patchelf", [
    "--set-rpath",
    file === executable ? "$ORIGIN/../lib" : "$ORIGIN",
    file,
  ]);
}
copyResources(root, source, release, join(root, ".cache/deps/sdl/LICENSE.txt"));
const applications = join(release, "share/applications");
const icons = join(release, "share/icons/hicolor/scalable/apps");
mkdirSync(applications, { recursive: true });
mkdirSync(icons, { recursive: true });
copyFileSync(
  join(root, "packaging/linux/tools.visualize.desktop"),
  join(applications, "tools.visualize.desktop"),
);
copyFileSync(join(root, "assets/icon.svg"), join(icons, "tools.visualize.svg"));
for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  const directory = join(release, `share/icons/hicolor/${size}x${size}/apps`);
  mkdirSync(directory, { recursive: true });
  copyFileSync(
    join(root, `assets/app-icons/${size}.png`),
    join(directory, "tools.visualize.png"),
  );
}
writeChecksums(release);
normalizeModes(release);
chmodSync(executable, 0o755);

const packages = join(release, "packages");
const contents = readdirSync(release);
mkdirSync(packages, { recursive: true });
const stem = `project-visualize-${version}-linux-${process.arch}`;
const archive = join(packages, `${stem}.tar.gz`);
run("tar", ["-czf", archive, "-C", release, ...contents]);

const staging = join(root, ".cache/linux-package");
rmSync(staging, { recursive: true, force: true });
const installed = join(staging, "root/usr/lib/project-visualize");
mkdirSync(installed, { recursive: true });
for (const name of contents)
  cpSync(join(release, name), join(installed, name), { recursive: true });
for (const path of ["usr/bin", "usr/share", "DEBIAN"])
  mkdirSync(join(staging, "root", path), { recursive: true });
symlinkSync(
  "../lib/project-visualize/bin/visualize",
  join(staging, "root/usr/bin/visualize"),
);
cpSync(join(release, "share"), join(staging, "root/usr/share"), {
  recursive: true,
});
const documentation = join(staging, "root/usr/share/doc/project-visualize");
mkdirSync(documentation, { recursive: true });
const notices = join(release, "licenses");
writeFileSync(
  join(documentation, "copyright"),
  [
    readFileSync(join(release, "LICENSE"), "utf8"),
    readFileSync(join(release, "THIRD_PARTY_NOTICES.md"), "utf8"),
    ...readdirSync(notices)
      .sort()
      .map((name) => `${name}\n\n${readFileSync(join(notices, name), "utf8")}`),
  ].join("\n\n"),
);
mkdirSync(join(staging, "debian"), { recursive: true });
writeFileSync(
  join(staging, "debian/control"),
  `Source: project-visualize\nSection: graphics\nPriority: optional\nMaintainer: Project Visualize contributors <dirkdev98@users.noreply.github.com>\n\nPackage: project-visualize\nArchitecture: any\nDescription: Native dashboards and documents for agent workflows\n`,
);
writeFileSync(
  join(staging, "debian/shlibs.local"),
  "libvisualize 0 project-visualize\nlibwgpu_native 0 project-visualize\nlibSDL3 0 project-visualize\n",
);
const dependencies = run(
  "dpkg-shlibdeps",
  [
    "-O",
    `-l${join(installed, "lib")}`,
    "-xproject-visualize",
    ...binaries.map((file) => `-e${join(installed, relative(release, file))}`),
  ],
  { cwd: staging },
)
  .trim()
  .replace(/^shlibs:Depends=/, "");
if (!dependencies || dependencies.includes("\n"))
  throw new Error("Cannot determine runtime dependencies.");
writeFileSync(
  join(staging, "root/DEBIAN/control"),
  `Package: project-visualize\nVersion: ${version}\nSection: graphics\nPriority: optional\nArchitecture: ${architecture}\nMaintainer: Project Visualize contributors <dirkdev98@users.noreply.github.com>\nDepends: ${dependencies}, libvulkan1\nRecommends: mesa-vulkan-drivers | vulkan-icd, libglib2.0-bin, xdg-desktop-portal\nDescription: Native dashboards and documents for agent workflows\n Create, inspect and export versioned visual artifacts through a native viewer\n and a command-line interface with a bundled agent skill.\n`,
);
chmodSync(join(staging, "root/DEBIAN"), 0o755);
normalizeModes(join(staging, "root"));
chmodSync(join(installed, "bin/visualize"), 0o755);
const deb = join(packages, `project-visualize_${version}_${architecture}.deb`);
run("dpkg-deb", ["--root-owner-group", "--build", join(staging, "root"), deb]);
const checksums = [archive, deb].map(
  (file) =>
    `${createHash("sha256").update(readFileSync(file)).digest("hex")}  ${basename(file)}`,
);
writeFileSync(join(packages, "SHA256SUMS"), `${checksums.join("\n")}\n`);
normalizeModes(packages);
rmSync(staging, { recursive: true, force: true });
console.error(`CLI: ${executable}\nArchive: ${archive}\nDebian: ${deb}`);
