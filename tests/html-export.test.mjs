import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), "visualize-export-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = join(directory, "library"),
    binary = resolve(process.env.VISUALIZE_TEST_BINARY ?? "dist/bin/visualize");
  const run = (args, input) =>
    spawnSync(binary, [...args, "--store", store], {
      input: input === undefined ? undefined : JSON.stringify(input),
      encoding: "utf8",
      timeout: 30_000,
    });
  function ok(args, input) {
    const result = run(args, input);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  const document = {
    schemaVersion: 1,
    type: "dashboard",
    title: "Station observations",
    body: [
      {
        type: "card",
        id: "north",
        title: "North",
        children: [
          { type: "metric", id: "summary", label: "Accepted", value: 12 },
        ],
      },
      {
        type: "card",
        id: "south",
        title: "South",
        children: [
          { type: "metric", id: "summary", label: "Accepted", value: 24 },
        ],
      },
    ],
  };
  const entry = ok(
    [
      "render",
      "--project",
      "orbital",
      "--artifact",
      "review",
      "--file",
      "-",
      "--scale",
      "1",
    ],
    document,
  );
  const exportArgs = [
    "export",
    "--project",
    entry.project,
    "--artifact",
    entry.artifact,
    "--version",
    entry.version,
  ];
  return { directory, store, run, ok, entry, exportArgs };
}
const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

test("managed HTML exports retain their source version without revising saved evidence", (t) => {
  const { ok, entry, store, exportArgs } = workspace(t);
  ok([
    "present",
    "--project",
    entry.project,
    "--artifact",
    entry.artifact,
    "--version",
    entry.version,
  ]);
  const files = [
    entry.document,
    entry.png,
    entry.pdf,
    join(entry.directory, "metadata.json"),
    join(dirname(entry.directory), "presented.json"),
  ];
  const before = files.map(hash),
    versions = ok(["list"]).versions;
  const result = ok([...exportArgs, "--format", "html"]);
  assert.equal(result.version, entry.version);
  assert.equal(result.project, entry.project);
  assert.equal(result.artifact, entry.artifact);
  assert.ok(
    result.output.startsWith(
      join(store, "exports", entry.project, entry.artifact, entry.version),
    ),
  );
  assert.match(readFileSync(result.output, "utf8"), /^<!doctype html>/);
  assert.equal(result.bytes, readFileSync(result.output).length);
  assert.deepEqual(files.map(hash), before);
  assert.deepEqual(ok(["list"]).versions, versions);
});

test("inspection exposes unambiguous paths for repeated block IDs", (t) => {
  const { ok, entry } = workspace(t);
  const result = ok([
    "inspect",
    "--project",
    entry.project,
    "--artifact",
    entry.artifact,
  ]);
  const paths = result.view.blocks.map((block) => block.path);
  assert.ok(paths.includes("body.north.summary"));
  assert.ok(paths.includes("body.south.summary"));
});

test("PNG and HTML accept a whole nested widget without changing the revision", (t) => {
  const { ok, entry, exportArgs } = workspace(t);
  const before = hash(entry.png);
  for (const format of ["png", "html"]) {
    const result = ok([
      ...exportArgs,
      "--format",
      format,
      "--block",
      "body.south.summary",
      "--width",
      "390",
    ]);
    assert.equal(result.block, "body.south.summary");
    assert.equal(result.version, entry.version);
    if (format === "png") {
      const png = readFileSync(result.output);
      assert.equal(png.readUInt32BE(16), 390 * result.scale);
      assert.ok(
        png.readUInt32BE(20) <
          readFileSync(entry.png).readUInt32BE(20) * result.scale,
      );
    }
  }
  assert.equal(hash(entry.png), before);
});

test("unknown block paths fail before creating an export", (t) => {
  const { directory, run, exportArgs } = workspace(t),
    output = join(directory, "missing.html");
  const result = run([
    ...exportArgs,
    "--format",
    "html",
    "--block",
    "body.summary",
    "--out",
    output,
  ]);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /Unknown block path/);
  assert.equal(existsSync(output), false);
});

test("HTML export cannot overwrite a saved version", (t) => {
  const { entry, run, exportArgs } = workspace(t),
    output = join(entry.directory, "saved.html");
  const result = run([...exportArgs, "--format", "html", "--out", output]);
  assert.equal(result.status, 1);
  assert.equal(existsSync(output), false);
});
