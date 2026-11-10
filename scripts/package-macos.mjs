import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  copyResources,
  copyWorkflow,
  writeChecksums,
} from "./package-resources.mjs";
import { bundleVersion, releaseVersion } from "./release-version.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(root, "dist");
const source = join(root, ".cache/release");
const original = join(release, "bin/visualize");
if (!existsSync(join(source, "bin/visualize")))
  throw new Error("Build the Maligator release artifact first.");
const sdl = execFileSync("brew", ["--prefix", "sdl3"], {
  encoding: "utf8",
}).trim();
const libraries = [
  join(root, ".cache/native/libvisualize.dylib"),
  join(root, ".cache/deps/wgpu/lib/libwgpu_native.dylib"),
  join(sdl, "lib/libSDL3.0.dylib"),
];
const dependencies = (file) =>
  execFileSync("otool", ["-L", file], { encoding: "utf8" })
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" (", 1)[0])
    .filter(Boolean);

function patch(file, relative) {
  for (const dependency of dependencies(file)) {
    const name = basename(dependency);
    if (libraries.some((library) => basename(library) === name)) {
      execFileSync("install_name_tool", [
        "-change",
        dependency,
        `@rpath/${name}`,
        file,
      ]);
    }
  }
  const commands = execFileSync("otool", ["-l", file], { encoding: "utf8" });
  for (const match of commands.matchAll(
    /cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+) \(offset/g,
  )) {
    if (match[1].startsWith("/"))
      execFileSync("install_name_tool", ["-delete_rpath", match[1], file]);
  }
  execFileSync("install_name_tool", ["-add_rpath", relative, file]);
  if (file.endsWith(".dylib"))
    execFileSync("install_name_tool", [
      "-id",
      `@rpath/${basename(file)}`,
      file,
    ]);
  execFileSync("codesign", ["--force", "--sign", "-", file], { stdio: "pipe" });
}

const app = join(release, "Project Visualize.app/Contents");
rmSync(release, { recursive: true, force: true });
mkdirSync(join(release, "bin"), { recursive: true });
copyFileSync(join(source, "bin/visualize"), original);
mkdirSync(join(app, "MacOS"), { recursive: true });
mkdirSync(join(app, "Frameworks"), { recursive: true });
mkdirSync(join(release, "lib"), { recursive: true });
copyFileSync(original, join(app, "MacOS/visualize"));
for (const library of libraries) {
  const name = basename(library);
  copyFileSync(library, join(release, "lib", name));
  copyFileSync(library, join(app, "Frameworks", name));
  patch(join(release, "lib", name), "@loader_path");
  patch(join(app, "Frameworks", name), "@loader_path");
}
patch(original, "@executable_path/../lib");
patch(join(app, "MacOS/visualize"), "@executable_path/../Frameworks");
const minimumSystemVersion = [
  "15.0",
  ...[
    original,
    ...libraries.map((library) => join(release, "lib", basename(library))),
  ].map((file) => {
    const commands = execFileSync(
      "otool",
      ["-arch", process.arch === "arm64" ? "arm64" : "x86_64", "-l", file],
      { encoding: "utf8" },
    );
    const version =
      commands.match(/cmd LC_BUILD_VERSION[\s\S]*?\bminos ([\d.]+)/)?.[1] ??
      commands.match(
        /cmd LC_VERSION_MIN_MACOSX[\s\S]*?\bversion ([\d.]+)/,
      )?.[1];
    if (!version)
      throw new Error(`Cannot determine the macOS minimum for ${file}`);
    return version;
  }),
]
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
  .at(-1);
writeFileSync(
  join(app, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Project Visualize</string>
<key>CFBundleDisplayName</key><string>Project Visualize</string>
<key>CFBundleIdentifier</key><string>tools.visualize.desktop</string>
<key>CFBundleExecutable</key><string>visualize</string>
<key>CFBundleIconFile</key><string>visualize.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${bundleVersion(releaseVersion(root))}</string>
<key>LSMinimumSystemVersion</key><string>${minimumSystemVersion}</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>\n`,
);
copyResources(root, source, release, join(sdl, "LICENSE.txt"));
copyWorkflow(
  root,
  join(app, "Resources", "agent-skill"),
  "../../MacOS/visualize",
);
const notices = join(release, "licenses");
const resources = join(app, "Resources");
mkdirSync(resources, { recursive: true });
copyFileSync(
  join(root, "assets/app-icons/visualize.icns"),
  join(resources, "visualize.icns"),
);
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md", "THIRD_PARTY.md"])
  copyFileSync(join(release, file), join(resources, file));
cpSync(notices, join(resources, "licenses"), { recursive: true });
execFileSync("codesign", ["--force", "--sign", "-", dirname(app)], {
  stdio: "pipe",
});
writeChecksums(release);
console.error(`CLI: ${original}\nApp: ${dirname(app)}`);
