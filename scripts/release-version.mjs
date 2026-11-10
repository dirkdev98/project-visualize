import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The version a build reports and is packaged under. Release workflows pass
 * `VISUALIZE_VERSION`, such as `2026.11.0-alpha.7` or `2026.01.1`; source builds
 * fall back to package.json.
 */
export function releaseVersion(root, environment = process.env) {
  const version =
    environment.VISUALIZE_VERSION ||
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/.test(version))
    throw new Error(
      `Version must be numeric with an optional prerelease suffix: ${version}`,
    );
  return version;
}

/** macOS bundle versions are period-separated integers only. */
export function bundleVersion(version) {
  return version.split("-")[0];
}

/** Debian sorts `~` before anything, so a prerelease precedes its release. */
export function debianVersion(version) {
  return version.replace("-", "~");
}
