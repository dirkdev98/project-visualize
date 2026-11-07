import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
  copyFileSync(join(source, file), join(release, file));
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
writeFileSync(
  join(app, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Project Visualize</string>
<key>CFBundleDisplayName</key><string>Project Visualize</string>
<key>CFBundleIdentifier</key><string>tools.visualize.desktop</string>
<key>CFBundleExecutable</key><string>visualize</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>\n`,
);
const notices = join(release, "licenses");
for (const [directory, executable] of [
  [join(release, "agent-skill"), "../bin/visualize"],
  [join(app, "Resources", "agent-skill"), "../../MacOS/visualize"],
]) {
  cpSync(join(root, ".cache/resources/workflow"), directory, {
    recursive: true,
  });
  writeFileSync(
    join(directory, "bundle.json"),
    `${JSON.stringify({ package: "project-visualize", executable, guide: "docs/artifacts.md", examples: "examples" }, null, 2)}\n`,
  );
}
mkdirSync(notices, { recursive: true });
for (const component of ["imgui", "implot", "cimgui", "cimplot", "wgpu"]) {
  const directory = join(root, ".cache/deps", component);
  for (const file of readdirSync(directory).filter((file) =>
    /^LICENSE/i.test(file),
  ))
    copyFileSync(join(directory, file), join(notices, `${component}-${file}`));
}
copyFileSync(join(sdl, "LICENSE.txt"), join(notices, "sdl3-LICENSE.txt"));
for (const file of ["stb_image.h", "stb_image_write.h"]) {
  const header = readFileSync(join(root, ".cache/deps", file), "utf8");
  const start = header.lastIndexOf("ALTERNATIVE A - MIT License");
  writeFileSync(
    join(notices, `${file}-LICENSE.txt`),
    header.slice(start, header.indexOf("ALTERNATIVE B", start)),
  );
}
copyFileSync(join(root, "THIRD_PARTY.md"), join(release, "THIRD_PARTY.md"));
copyFileSync(
  join(root, "assets/fonts/LICENSE.txt"),
  join(notices, "ibm-plex-LICENSE.txt"),
);
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location.startsWith("node_modules/") || entry.dev) continue;
  const directory = join(root, location);
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    if (
      !file.isFile() ||
      !/^(license|copying|notice)([._-]|$)/i.test(file.name)
    )
      continue;
    const name = location.slice("node_modules/".length).replaceAll("/", "_");
    copyFileSync(
      join(directory, file.name),
      join(notices, `${name}-${file.name}`),
    );
  }
}
const resources = join(app, "Resources");
mkdirSync(resources, { recursive: true });
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md", "THIRD_PARTY.md"])
  copyFileSync(join(release, file), join(resources, file));
cpSync(notices, join(resources, "licenses"), { recursive: true });
execFileSync("codesign", ["--force", "--sign", "-", dirname(app)], {
  stdio: "pipe",
});
// The dylib paths change after Maligator's artifact checksums are written.
const { createHash } = await import("node:crypto");
const checksums = [];
function hash(directory) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, file.name);
    if (file.isDirectory()) hash(location);
    else if (file.name !== "SHA256SUMS")
      checksums.push(
        `${createHash("sha256").update(readFileSync(location)).digest("hex")}  ${location.slice(release.length + 1)}`,
      );
  }
}
hash(release);
writeFileSync(join(release, "SHA256SUMS"), `${checksums.sort().join("\n")}\n`);
console.error(`CLI: ${original}\nApp: ${dirname(app)}`);
