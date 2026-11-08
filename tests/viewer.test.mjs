import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
async function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), "visualize-viewer-")),
    store = join(directory, "library");
  const binary = resolve(
    process.env.VISUALIZE_TEST_BINARY ?? "dist/bin/visualize",
  );
  const raw = (args) =>
    execute(binary, [...args, "--store", store], {
      encoding: "utf8",
      timeout: 70_000,
    });
  const cli = async (args) => JSON.parse((await raw(args)).stdout);
  t.after(async () => {
    try {
      await cli(["viewer", "--action", "close"]);
    } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
  const document = {
    schemaVersion: 1,
    type: "dashboard",
    title: "Station observations",
    datasets: {
      stations: [
        { name: "Cedar", amount: 12 },
        { name: "Birch", amount: 24 },
      ],
    },
    body: [
      {
        type: "control",
        id: "station",
        kind: "select",
        label: "Station",
        dataset: "stations",
        field: "name",
      },
      {
        type: "metric",
        label: "Total",
        source: { dataset: "stations", field: "amount", aggregate: "sum" },
      },
    ],
  };
  const file = join(directory, "artifact.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(file, JSON.stringify(document));
  const render = (artifact) =>
    cli([
      "render",
      "--project",
      "orbital",
      "--artifact",
      artifact,
      "--file",
      file,
      "--scale",
      "1",
    ]);
  const open = (entry, extra = []) =>
    cli([
      "open",
      "--project",
      entry.project,
      "--artifact",
      entry.artifact,
      "--version",
      entry.version,
      "--focus",
      "false",
      ...extra,
    ]);
  return { cli, raw, render, open, directory };
}

test("CLI navigation reuses the viewer and reapplies parameters to the same revision", async (t) => {
  const w = await workspace(t),
    entry = await w.render("review");
  const initial = await w.open(entry),
    changed = await w.open(entry, ["--params", '{"station":"Cedar"}']);
  assert.equal(changed.pid, initial.pid);
  assert.ok(initial.window.x > 0 && initial.window.y > 0);
  assert.ok(initial.canvas.width > 0 && initial.canvas.height > 0);
  assert.equal(changed.selected.version, entry.version);
  assert.equal(changed.parameters.station, "Cedar");
  const screenshot = await w.cli([
    "viewer",
    "--action",
    "capture",
    "--out",
    join(w.directory, "viewer.png"),
    "--content-width",
    "358",
    "--height",
    "700",
    "--focus",
    "false",
  ]);
  assert.equal(screenshot.pid, initial.pid);
  assert.equal(screenshot.kind, "viewer-draw-data");
  assert.equal(screenshot.files[0].canvas.width, 358);
  assert.ok(readFileSync(screenshot.files[0].output).readUInt32BE(20) > 0);
});

test("presenting another artifact navigates the already running viewer to that exact revision", async (t) => {
  const w = await workspace(t),
    first = await w.render("review"),
    second = await w.render("notes");
  const running = await w.open(first);
  const presented = await w.cli([
    "present",
    "--project",
    second.project,
    "--artifact",
    second.artifact,
    "--version",
    second.version,
  ]);
  assert.equal(presented.viewer.pid, running.pid);
  assert.equal(presented.viewer.selected.version, second.version);
  assert.equal(presented.viewer.selected.artifact, second.artifact);
});

test("simultaneous opens create one viewer and a crashed owner can be replaced", async (t) => {
  const w = await workspace(t),
    entry = await w.render("review");
  const openings = await Promise.all([
    w.open(entry),
    w.open(entry),
    w.open(entry),
  ]);
  assert.equal(new Set(openings.map((result) => result.pid)).size, 1);
  process.kill(openings[0].pid, "SIGKILL");
  const restarted = await w.open(entry);
  assert.notEqual(restarted.pid, openings[0].pid);
  assert.equal(restarted.selected.version, entry.version);
});

test("an unresponsive owner reports an error instead of creating another viewer", async (t) => {
  const w = await workspace(t),
    entry = await w.render("review"),
    running = await w.open(entry);
  process.kill(running.pid, "SIGSTOP");
  try {
    await assert.rejects(w.open(entry), /did not acknowledge/);
  } finally {
    process.kill(running.pid, "SIGCONT");
  }
  const status = await w.cli(["viewer", "--action", "status"]);
  assert.equal(status.pid, running.pid);
});
