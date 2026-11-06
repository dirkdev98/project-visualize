import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const executable = resolve(
  process.env.VISUALIZE_TEST_BINARY ?? "dist/bin/visualize",
);
const exec = promisify(execFile);
const minimal = (value = 12) => ({
  schemaVersion: 1,
  title: "Station review",
  context: { source: "Fictional", inputs: [1, 2] },
  body: [{ type: "metric", label: "Accepted observations", value }],
});
const digest = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), "visualize-test-"));
  const store = join(root, "library");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function run(args, input) {
    const result = spawnSync(executable, [...args, "--store", store], {
      input: input === undefined ? undefined : JSON.stringify(input),
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.ifError(result.error);
    return result;
  }
  function ok(args, input) {
    const result = run(args, input);
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    return JSON.parse(result.stdout);
  }
  function render(doc = minimal()) {
    return ok(
      ["render", "--project", "orbital", "--artifact", "review", "--file", "-"],
      doc,
    );
  }
  return { root, store, run, ok, render };
}

test("render returns saved documents and actual PNG/PDF files as JSON", (t) => {
  const { render } = workspace(t);
  const entry = render();
  assert.deepEqual(JSON.parse(readFileSync(entry.document, "utf8")), minimal());
  assert.deepEqual(
    readFileSync(entry.png).subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const pdf = readFileSync(entry.pdf).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4\n"));
  assert.ok(pdf.endsWith("%%EOF\n"));
});

test("a revision keeps earlier source and output intact", (t) => {
  const { render, ok } = workspace(t);
  const first = render();
  const before = digest(first.png);
  const second = render(minimal(28));
  assert.notEqual(first.version, second.version);
  assert.equal(digest(first.png), before);
  assert.notEqual(digest(second.png), before);
  const original = ok([
    "inspect",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--version",
    first.version,
  ]);
  assert.deepEqual(original.document, minimal());
  const latest = ok([
    "inspect",
    "--project",
    "orbital",
    "--artifact",
    "review",
  ]);
  assert.equal(latest.version, second.version);
});

test("concurrent agents preserve every completed revision", async (t) => {
  const { root, store, ok } = workspace(t);
  const files = [31, 47, 59].map((value) => {
    const file = join(root, `${value}.json`);
    writeFileSync(file, JSON.stringify(minimal(value)));
    return file;
  });
  const results = await Promise.all(
    files.map((file) =>
      exec(
        executable,
        [
          "render",
          "--project",
          "orbital",
          "--artifact",
          "review",
          "--file",
          file,
          "--store",
          store,
        ],
        { timeout: 60_000 },
      ),
    ),
  );
  const versions = results.map((result) => JSON.parse(result.stdout).version);
  const saved = ok(["list"]).versions.map((entry) => entry.version);
  assert.deepEqual(new Set(saved), new Set(versions));
});

test("image assets survive source deletion and can be exported from another directory", (t) => {
  const { root, store, ok } = workspace(t);
  const image = join(root, "station.png"),
    source = join(root, "document.json");
  writeFileSync(
    image,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const document = {
    ...minimal(),
    assets: { station: "station.png" },
    body: [
      { type: "image", asset: "station", caption: "Fictional station" },
      { type: "markdown", content: "![Station](asset:station)" },
    ],
  };
  writeFileSync(source, JSON.stringify(document));
  const entry = ok([
    "render",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--file",
    source,
  ]);
  rmSync(image);
  const output = join(root, "new-size.png");
  const result = spawnSync(
    executable,
    [
      "export",
      "--project",
      "orbital",
      "--artifact",
      "review",
      "--format",
      "png",
      "--out",
      output,
      "--width",
      "960",
      "--scale",
      "2",
      "--store",
      store,
    ],
    { cwd: tmpdir(), encoding: "utf8", timeout: 60_000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(output));
  assert.ok(existsSync(join(entry.directory, "assets/station.png")));
  assert.equal(readFileSync(output).readUInt32BE(16), 1920);
});

test("exporting a saved snapshot does not create a revision", (t) => {
  const { root, render, ok } = workspace(t);
  const entry = render();
  const out = join(root, "report.pdf");
  ok([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--format",
    "pdf",
    "--out",
    out,
  ]);
  assert.equal(digest(out), digest(entry.pdf));
  assert.deepEqual(
    ok(["list"]).versions.map((entry) => entry.version),
    [entry.version],
  );
});

test("rerendering a PDF accepts an uppercase filename extension", (t) => {
  const { root, render, ok } = workspace(t);
  render();
  const out = join(root, "report.PDF");
  ok([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--format",
    "pdf",
    "--out",
    out,
    "--width",
    "960",
  ]);
  assert.equal(readFileSync(out).subarray(0, 8).toString(), "%PDF-1.4");
});

test("export cannot overwrite a saved version", (t) => {
  const { render, run } = workspace(t);
  const entry = render(),
    before = digest(entry.png);
  const result = run([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--format",
    "png",
    "--out",
    entry.png,
  ]);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /preserve history/);
  assert.equal(digest(entry.png), before);
});

test("invalid chart lengths report the input location before saving", (t) => {
  const { run, ok } = workspace(t);
  const result = run(
    ["render", "--project", "orbital", "--artifact", "review", "--file", "-"],
    {
      ...minimal(),
      body: [
        {
          type: "chart",
          kind: "line",
          series: [{ name: "Count", x: [1], values: [2, 3] }],
        },
      ],
    },
  );
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /body\[0\]\.series\[0\]\.x/);
  assert.deepEqual(ok(["list"]).versions, []);
});

test("diagram edges must refer to existing nodes", (t) => {
  const { run } = workspace(t);
  const result = run(["validate", "--file", "-"], {
    ...minimal(),
    body: [
      {
        type: "diagram",
        nodes: [{ id: "start", label: "Start" }],
        edges: [{ from: "start", to: "missing" }],
      },
    ],
  });
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /existing node IDs/);
});

test("unsupported widgets are rejected instead of disappearing from a report", (t) => {
  const { run } = workspace(t);
  const result = run(["validate", "--file", "-"], {
    ...minimal(),
    body: [{ type: "unknown" }],
  });
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /unsupported block type/);
});

test("a failed image render publishes no partial version", (t) => {
  const { root, run, ok, store } = workspace(t);
  const image = join(root, "broken.png");
  writeFileSync(image, "invalid image");
  const result = run(
    ["render", "--project", "orbital", "--artifact", "review", "--file", "-"],
    {
      ...minimal(),
      assets: { station: image },
      body: [{ type: "image", asset: "station" }],
    },
  );
  assert.equal(result.status, 1);
  assert.deepEqual(ok(["list"]).versions, []);
  assert.deepEqual(readdirSync(join(store, "projects/orbital/review")), []);
});

test("artifact IDs cannot escape the selected project", (t) => {
  const { run } = workspace(t);
  const result = run(
    [
      "render",
      "--project",
      "../outside",
      "--artifact",
      "review",
      "--file",
      "-",
    ],
    minimal(),
  );
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /project must use/);
});

test("a composed dashboard and rich notebook render through the CLI", (t) => {
  const { root, ok } = workspace(t);
  for (const name of ["observatory", "notebook"]) {
    const file = join(root, `${name}.json`);
    copyFileSync(resolve(`examples/${name}.json`), file);
    const entry = ok([
      "render",
      "--project",
      "examples",
      "--artifact",
      name,
      "--file",
      file,
    ]);
    assert.ok(existsSync(entry.png));
    assert.ok(existsSync(entry.pdf));
  }
});

test("an artifact larger than the export surface fails without truncating it", (t) => {
  const { run, ok } = workspace(t);
  const result = run(
    [
      "render",
      "--project",
      "orbital",
      "--artifact",
      "review",
      "--file",
      "-",
      "--scale",
      "2",
    ],
    {
      ...minimal(),
      body: Array.from({ length: 12 }, () => ({
        type: "spacer",
        height: 2000,
      })),
    },
  );
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /too tall/);
  assert.deepEqual(ok(["list"]).versions, []);
});
