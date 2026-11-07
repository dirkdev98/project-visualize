import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "linux")
  throw new Error("Check Linux packages on Linux.");
const packages = resolve("dist/packages");
const scratch = mkdtempSync(join(tmpdir(), "visualize-packages-"));
const reports = [];
function run(file, args, options = {}) {
  return execFileSync(file, args, {
    encoding: "utf8",
    timeout: 60_000,
    ...options,
  });
}
try {
  for (const format of ["tar.gz", "deb"]) {
    const archive = readdirSync(packages).find((name) =>
      name.endsWith(`.${format}`),
    );
    assert.ok(archive, `Missing ${format} package`);
    const directory = join(scratch, format);
    mkdirSync(directory);
    if (format === "deb")
      run("dpkg-deb", ["--extract", join(packages, archive), directory]);
    else run("tar", ["-xzf", join(packages, archive), "-C", directory]);
    const bundle =
      format === "deb"
        ? join(directory, "usr/lib/project-visualize")
        : directory;
    const executable =
      format === "deb"
        ? join(directory, "usr/bin/visualize")
        : join(bundle, "bin/visualize");
    const store = join(scratch, `${format}-library`);
    const environment = {
      ...process.env,
      LD_LIBRARY_PATH: "",
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? scratch,
    };
    function cli(...args) {
      return JSON.parse(
        run(executable, [...args, "--store", store], {
          cwd: scratch,
          env: environment,
        }),
      );
    }
    for (const file of [
      join(bundle, "bin/visualize"),
      ...readdirSync(join(bundle, "lib")).map((name) =>
        join(bundle, "lib", name),
      ),
    ]) {
      assert.equal(
        statSync(file).mode & 0o022,
        0,
        `${file} is writable by another user`,
      );
      assert.doesNotMatch(
        run("ldd", [file], { env: environment }),
        /not found/,
      );
    }
    const resources = cli("skill");
    assert.ok(existsSync(resources.skill));
    copyFileSync(
      join(resources.examples, "categories.json"),
      join(scratch, "document.json"),
    );
    cli("validate", "--file", "document.json");
    const rendered = cli(
      "render",
      "--project",
      "orbital",
      "--artifact",
      "evidence",
      "--file",
      "document.json",
      "--mobile-width",
      "390",
    );
    assert.equal(rendered.scale, 2);
    for (const file of Object.values(rendered.screenshots))
      assert.deepEqual(
        readFileSync(file).subarray(0, 8),
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    cli(
      "present",
      "--project",
      "orbital",
      "--artifact",
      "evidence",
      "--version",
      rendered.version,
    );
    assert.equal(
      cli("inspect", "--project", "orbital", "--artifact", "evidence")
        .currentPresentation,
      true,
    );
    const linked = join(scratch, `${format}-skill`);
    cli("install", "--skill", linked);
    assert.ok(existsSync(join(linked, "SKILL.md")));
    reports.push({
      format,
      archive,
      rendered: true,
      presented: true,
      skillLinked: true,
    });
  }
  console.log(JSON.stringify({ ok: true, packages: reports }));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
