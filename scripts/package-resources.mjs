import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export function copyWorkflow(root, directory, executable) {
  cpSync(join(root, ".cache/resources/workflow"), directory, {
    recursive: true,
  });
  writeFileSync(
    join(directory, "bundle.json"),
    `${JSON.stringify({ package: "project-visualize", executable, guide: "docs/artifacts.md", examples: "examples" }, null, 2)}\n`,
  );
}

export function copyResources(root, source, release, sdlLicense) {
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    copyFileSync(join(source, file), join(release, file));
  copyWorkflow(root, join(release, "agent-skill"), "../bin/visualize");
  const notices = join(release, "licenses");
  mkdirSync(notices, { recursive: true });
  for (const component of ["imgui", "implot", "cimgui", "cimplot", "wgpu"]) {
    const directory = join(root, ".cache/deps", component);
    for (const file of readdirSync(directory).filter((file) =>
      /^LICENSE/i.test(file),
    ))
      copyFileSync(
        join(directory, file),
        join(notices, `${component}-${file}`),
      );
  }
  copyFileSync(sdlLicense, join(notices, "sdl3-LICENSE.txt"));
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
  const lock = JSON.parse(
    readFileSync(join(root, "package-lock.json"), "utf8"),
  );
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
}

export function writeChecksums(release) {
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
  writeFileSync(
    join(release, "SHA256SUMS"),
    `${checksums.sort().join("\n")}\n`,
  );
}
