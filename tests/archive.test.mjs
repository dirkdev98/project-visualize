import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

function workspace(t) {
  const store = mkdtempSync(join(tmpdir(), "visualize-archive-"));
  t.after(() => rmSync(store, { recursive: true, force: true }));
  const run = (args, document) =>
    spawnSync(
      resolve(process.env.VISUALIZE_TEST_BINARY ?? "dist/bin/visualize"),
      [...args, "--store", store],
      {
        encoding: "utf8",
        input: document && JSON.stringify(document),
        timeout: 30_000,
      },
    );
  function cli(args, document) {
    const result = run(args, document);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  const identity = ["--project", "orbital", "--artifact", "station-review"];
  const render = (value) =>
    cli(["render", ...identity, "--file", "-", "--scale", "1"], {
      schemaVersion: 1,
      type: "document",
      title: "Station observations",
      body: [{ type: "metric", label: "Accepted", value }],
    });
  return { cli, run, identity, render };
}
const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

test("archiving hides every revision while search and export retain the saved evidence", (t) => {
  const { cli, identity, render } = workspace(t);
  const first = render(12),
    second = render(24);
  cli(["present", ...identity, "--version", first.version]);
  const files = [
    first.document,
    first.png,
    first.pdf,
    second.document,
    second.png,
    second.pdf,
  ];
  const before = files.map(hash);
  cli(["archive", ...identity]);
  assert.deepEqual(cli(["list"]).versions, []);
  const search = cli(["list", "--search", "Station observations"]).versions;
  assert.deepEqual(
    search.map((entry) => entry.version),
    [second.version, first.version],
  );
  assert.ok(search.every((entry) => entry.archivedAt));
  assert.equal(
    search.find((entry) => entry.version === first.version).currentPresentation,
    true,
  );
  const exported = cli([
    "export",
    ...identity,
    "--version",
    first.version,
    "--format",
    "html",
  ]);
  assert.equal(exported.version, first.version);
  assert.deepEqual(files.map(hash), before);
  const third = render(36);
  assert.deepEqual(cli(["list"]).versions, []);
  assert.equal(
    cli(["list", "--status", "archived"]).versions[0].version,
    third.version,
  );
});

test("restoring an artifact makes its existing revisions visible again", (t) => {
  const { cli, identity, render } = workspace(t);
  const entry = render(12);
  cli(["archive", ...identity]);
  cli(["restore", ...identity]);
  assert.deepEqual(
    cli(["list"]).versions.map((entry) => entry.version),
    [entry.version],
  );
  assert.deepEqual(cli(["list", "--status", "archived"]).versions, []);
});

test("archiving a missing artifact fails without creating an empty library item", (t) => {
  const { cli, run, identity } = workspace(t);
  const result = run(["archive", ...identity]);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /No saved version/);
  assert.deepEqual(cli(["list", "--status", "all"]).versions, []);
});
