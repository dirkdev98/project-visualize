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
import { PDFDocument } from "pdf-lib";

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

test("render returns saved documents and actual PNG/PDF files as JSON", async (t) => {
  const { render } = workspace(t);
  const entry = render();
  assert.deepEqual(JSON.parse(readFileSync(entry.document, "utf8")), minimal());
  assert.deepEqual(
    readFileSync(entry.png).subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const pdf = await PDFDocument.load(readFileSync(entry.pdf));
  assert.ok(pdf.getPageCount() > 0);
  assert.equal(pdf.getTitle(), minimal().title);
});

test("PDF paper and orientation follow the saved document", async (t) => {
  const { render } = workspace(t);
  for (const [paper, portrait] of [
    ["a4", [595.276, 841.89]],
    ["letter", [612, 792]],
  ]) {
    for (const orientation of ["portrait", "landscape"]) {
      const entry = render({ ...minimal(), pdf: { paper, orientation } });
      const pdf = await PDFDocument.load(readFileSync(entry.pdf));
      const { width, height } = pdf.getPage(0).getSize();
      const expected =
        orientation === "portrait" ? portrait : [...portrait].reverse();
      assert.deepEqual([width, height], expected);
    }
  }
});

test("paginated PDF text preserves Unicode prose, code and table content", async (t) => {
  const { render } = workspace(t);
  const paragraphs = Array.from(
    { length: 18 },
    (_, i) =>
      `Station finding ${i}: café and Ω remain visible in this evidence.`,
  );
  const code = "const accepted = rows.filter(row => row.active);";
  const entry = render({
    ...minimal(),
    title: "Station café Δ",
    body: [
      { type: "code", language: "typescript", content: code },
      ...paragraphs.map((content) => ({
        type: "markdown",
        content: `## Evidence\n\n${content}\n\nA **clear** note with *emphasis*.`,
      })),
      {
        type: "table",
        columns: [{ key: "station", label: "Station name" }],
        rows: [{ station: "North evidence" }],
      },
    ],
  });
  const pdf = await PDFDocument.load(readFileSync(entry.pdf));
  assert.ok(pdf.getPageCount() > 1);
  const result = spawnSync("pdftotext", ["-layout", entry.pdf, "-"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const extracted = result.stdout.replace(/\s+/g, " ");
  for (const value of [
    "Station café Δ",
    code,
    "Station name",
    "North evidence",
    ...paragraphs,
  ])
    assert.ok(extracted.includes(value), `PDF text is missing: ${value}`);
});

function pdfTextPages(file) {
  const result = spawnSync("pdftotext", ["-layout", file, "-"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\f").filter((page) => page.trim());
}
function assertTableContinuation(pages, header, markers) {
  for (const marker of markers)
    assert.equal(pages.join(" ").split(marker).length - 1, 1, marker);
  const containing = pages.filter((page) =>
    markers.some((marker) => page.includes(marker)),
  );
  assert.ok(containing.length > 1, "The table must continue on another page");
  for (const page of containing) assert.ok(page.includes(header), header);
}

test("sequential tables repeat their own headings on continuation pages", (t) => {
  const { render } = workspace(t);
  const groups = ["NORTH", "SOUTH"].map((name) => ({
    header: `${name} observations`,
    markers: Array.from(
      { length: 70 },
      (_, i) => `${name}_${String(i).padStart(3, "0")}`,
    ),
  }));
  const entry = render({
    ...minimal(),
    body: groups.map((group) => ({
      type: "table",
      columns: [{ key: "code", label: group.header }],
      rows: group.markers.map((code) => ({ code })),
    })),
  });
  const pages = pdfTextPages(entry.pdf);
  for (const group of groups) {
    assertTableContinuation(pages, group.header, group.markers);
    for (const page of pages)
      if (!group.markers.some((marker) => page.includes(marker)))
        assert.ok(!page.includes(group.header));
  }
});

test("parallel tables retain separate headings when their rows have different heights", (t) => {
  const { render } = workspace(t);
  const groups = ["LEFT", "RIGHT"].map((name) => ({
    header: `${name} observations`,
    markers: Array.from(
      { length: 70 },
      (_, i) => `${name}_${String(i).padStart(3, "0")}`,
    ),
  }));
  const entry = render({
    ...minimal(),
    body: [
      {
        type: "row",
        children: groups.map((group, i) => ({
          type: "table",
          columns: [
            { key: "code", label: group.header },
            {
              key: "note",
              label: i
                ? "Observation notes with a deliberately long heading"
                : "Note",
            },
          ],
          rows: group.markers.map((code) => ({
            code,
            note: i
              ? "A fictional observation with a wrapped note for this station."
              : "Accepted",
          })),
        })),
      },
    ],
  });
  const pages = pdfTextPages(entry.pdf);
  for (const group of groups)
    assertTableContinuation(pages, group.header, group.markers);
});

test("Markdown table continuation repeats its heading in a dark high-density export", (t) => {
  const { ok } = workspace(t);
  const header = "Observation code";
  const markers = Array.from(
    { length: 80 },
    (_, i) => `MARK_${String(i).padStart(3, "0")}`,
  );
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
      "2",
    ],
    {
      ...minimal(),
      theme: "dark",
      body: [
        {
          type: "markdown",
          content: [
            `| ${header} | Finding |`,
            "| --- | --- |",
            ...markers.map((code) => `| ${code} | Accepted café Ω |`),
          ].join("\n"),
        },
      ],
    },
  );
  assertTableContinuation(pdfTextPages(entry.pdf), header, markers);
});

test("timeline events and status badges remain readable in an exported document", (t) => {
  const { render } = workspace(t);
  const events = [
    {
      label: "Monday",
      title: "Collect the baseline",
      content: "Retain the source rows.",
      tone: "positive",
    },
    {
      label: "Friday",
      title: "Review the caveat",
      content: "Repeat the shortened window.",
      tone: "warning",
    },
  ];
  const badge = "Ready for review";
  const entry = render({
    ...minimal(),
    body: [
      {
        type: "card",
        children: [
          { type: "badge", label: badge },
          { type: "timeline", events },
        ],
      },
    ],
  });
  const result = spawnSync("pdftotext", ["-layout", entry.pdf, "-"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const extracted = result.stdout.replace(/\s+/g, " ");
  for (const value of [
    badge,
    ...events.flatMap((event) => [event.label, event.title, event.content]),
  ])
    assert.ok(extracted.includes(value), `PDF text is missing: ${value}`);
});

test("a theme override becomes part of the saved appearance", (t) => {
  const { ok } = workspace(t);
  const entry = ok(
    [
      "render",
      "--project",
      "orbital",
      "--artifact",
      "review",
      "--file",
      "-",
      "--theme",
      "light",
    ],
    { ...minimal(), theme: "dark" },
  );
  assert.equal(JSON.parse(readFileSync(entry.document, "utf8")).theme, "light");
});

test("theme exports change appearance while preserving saved evidence", (t) => {
  const { root, render, ok } = workspace(t);
  const code = "const accepted = rows.length;";
  const entry = render({
    ...minimal(),
    body: [{ type: "code", language: "typescript", content: code }],
  });
  const before = [entry.document, entry.png, entry.pdf].map(digest);
  const versions = ok(["list"]).versions;
  const png = join(root, "dark.png"),
    pdf = join(root, "dark.pdf");
  for (const [format, out] of [
    ["png", png],
    ["pdf", pdf],
  ])
    ok([
      "export",
      "--project",
      "orbital",
      "--artifact",
      "review",
      "--format",
      format,
      "--out",
      out,
      "--theme",
      "dark",
    ]);
  assert.notEqual(digest(png), digest(entry.png));
  assert.deepEqual([entry.document, entry.png, entry.pdf].map(digest), before);
  assert.deepEqual(ok(["list"]).versions, versions);
  const extracted = spawnSync("pdftotext", ["-layout", pdf, "-"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.ifError(extracted.error);
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.ok(extracted.stdout.replace(/\s+/g, " ").includes(code));
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

test("rerendering a PDF accepts an uppercase filename extension", async (t) => {
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
  const pdf = await PDFDocument.load(readFileSync(out));
  assert.ok(pdf.getPageCount() > 0);
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

test("missing table cells may use names shared with object methods", (t) => {
  const { render } = workspace(t);
  const document = {
    ...minimal(),
    body: [
      {
        type: "table",
        columns: [
          { key: "constructor", label: "Constructor" },
          { key: "toString", label: "Description" },
          { key: "station", label: "Station" },
        ],
        rows: [{ station: "North" }],
      },
    ],
  };
  const entry = render(document);
  assert.deepEqual(JSON.parse(readFileSync(entry.document, "utf8")), document);
  assert.ok(readFileSync(entry.png).length > 0);
});

test("duplicate sibling block IDs are rejected before publishing", (t) => {
  const { run, ok } = workspace(t);
  const document = {
    ...minimal(),
    body: [
      { type: "text", id: "summary", content: "North" },
      { type: "text", id: "summary", content: "South" },
    ],
  };
  const result = run(
    ["render", "--project", "orbital", "--artifact", "review", "--file", "-"],
    document,
  );
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /body\[1\]\.id/);
  assert.deepEqual(ok(["list"]).versions, []);
});

test("block IDs can repeat in separate containers", (t) => {
  const { ok } = workspace(t);
  const document = {
    ...minimal(),
    body: [
      {
        type: "column",
        id: "north",
        children: [{ type: "text", id: "summary", content: "North" }],
      },
      {
        type: "column",
        id: "south",
        children: [{ type: "text", id: "summary", content: "South" }],
      },
    ],
  };
  assert.equal(ok(["validate", "--file", "-"], document).valid, true);
});

function linkedDocument() {
  return {
    schemaVersion: 1,
    title: "Linked station evidence",
    datasets: {
      observations: [
        { station: "North", day: "Mon", accepted: 12, active: true },
        { station: "South", day: "Mon", accepted: 8, active: false },
        { station: "North", day: "Tue", accepted: 18, active: true },
        { station: "South", day: "Tue", accepted: 11, active: true },
        { station: "West", day: "Mon", accepted: 5, active: false },
        { station: "West", day: "Tue", accepted: 7, active: true },
      ],
    },
    body: [
      {
        type: "control",
        id: "station",
        kind: "select",
        label: "Station",
        dataset: "observations",
        field: "station",
      },
      {
        type: "control",
        id: "accepted",
        kind: "range",
        label: "Accepted",
        dataset: "observations",
        field: "accepted",
      },
      {
        type: "control",
        id: "active",
        kind: "toggle",
        label: "Active only",
        dataset: "observations",
        field: "active",
      },
      {
        type: "control",
        id: "day",
        kind: "search",
        label: "Day",
        dataset: "observations",
        field: "day",
      },
      {
        type: "metric",
        id: "total",
        label: "Accepted",
        source: {
          dataset: "observations",
          field: "accepted",
          aggregate: "sum",
        },
      },
      {
        type: "metric",
        id: "mean",
        label: "Mean",
        source: {
          dataset: "observations",
          field: "accepted",
          aggregate: "mean",
        },
      },
      {
        type: "chart",
        id: "daily",
        kind: "bar",
        source: {
          dataset: "observations",
          x: "day",
          y: "accepted",
          aggregate: "sum",
        },
      },
      {
        type: "table",
        id: "evidence",
        dataset: "observations",
        columns: [
          { key: "station", label: "Station" },
          { key: "day", label: "Day" },
          { key: "accepted", label: "Accepted" },
        ],
      },
    ],
  };
}

function inspectView(ok, params) {
  return ok([
    "inspect",
    "--project",
    "orbital",
    "--artifact",
    "review",
    ...(params === undefined ? [] : ["--params", JSON.stringify(params)]),
  ]).view;
}

test("bar selection exposes typed categories and resolves the same linked control", (t) => {
  const { render, ok } = workspace(t);
  const values = [1, "1", null, 12];
  const document = {
    ...minimal(),
    datasets: {
      observations: values.map((station, i) => ({ station, accepted: i + 1 })),
    },
    body: [
      {
        type: "chart",
        id: "stations",
        kind: "bar",
        select: "station",
        source: {
          dataset: "observations",
          x: "station",
          y: "accepted",
        },
      },
      {
        type: "control",
        id: "station",
        kind: "select",
        label: "Station",
        dataset: "observations",
        field: "station",
      },
      {
        type: "metric",
        label: "Accepted",
        source: {
          dataset: "observations",
          field: "accepted",
          aggregate: "sum",
        },
      },
    ],
  };
  render(document);
  const all = inspectView(ok);
  assert.deepEqual(all.chartSelections["body.stations"], {
    control: "station",
    values,
  });
  assert.deepEqual(
    all.body[0].series[0].x,
    values.map((_, i) => i),
  );
  assert.notEqual(all.body[0].labels[0], all.body[0].labels[1]);
  for (const [index, station] of values.entries()) {
    const view = inspectView(ok, { station });
    assert.deepEqual(view.chartSelections["body.stations"].values, [station]);
    assert.equal(view.datasetRows.observations, 1);
    assert.equal(view.body[2].value, index + 1);
  }
  assert.deepEqual(
    inspectView(ok, { station: { all: true } }).chartSelections,
    all.chartSelections,
  );
});

test("numeric selection categories remain separate even when their coordinates are close", (t) => {
  const { render, ok } = workspace(t);
  const values = [1.01, 1.02, 100];
  render({
    ...minimal(),
    datasets: { readings: values.map((x) => ({ x, accepted: 2 })) },
    body: [
      {
        type: "control",
        id: "reading",
        kind: "select",
        label: "Reading",
        dataset: "readings",
        field: "x",
      },
      {
        type: "chart",
        id: "readings",
        kind: "bar",
        select: "reading",
        source: { dataset: "readings", x: "x", y: "accepted" },
      },
    ],
  });
  const view = inspectView(ok);
  assert.deepEqual(view.chartSelections["body.readings"].values, values);
  assert.deepEqual(
    view.body[1].series[0].x,
    values.map((_, i) => i),
  );
});

test("chart selection rejects an incompatible target before publishing", (t) => {
  const { run, ok } = workspace(t);
  const original = linkedDocument();
  const chart = {
    ...original.body.find((block) => block.id === "daily"),
    select: "station",
  };
  const variants = [
    chart,
    { ...chart, select: "missing" },
    { ...chart, select: "day" },
    { ...chart, kind: "line" },
    {
      type: "chart",
      kind: "bar",
      select: "station",
      series: [{ name: "North", values: [3] }],
    },
  ];
  for (const candidate of variants) {
    const result = run(
      ["render", "--project", "orbital", "--artifact", "review", "--file", "-"],
      {
        ...original,
        body: [
          ...original.body.filter((block) => block.type === "control"),
          candidate,
        ],
      },
    );
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stderr).error, /select/);
  }
  assert.deepEqual(ok(["list"]).versions, []);
});

test("a parameter filters a shared table, metric and chart consistently", (t) => {
  const { render, ok } = workspace(t);
  const document = linkedDocument();
  render(document);
  const selected = document.datasets.observations.filter(
    (row) => row.station === "North",
  );
  const view = inspectView(ok, { station: "North" });
  assert.deepEqual(
    view.body.find((block) => block.id === "evidence").rows,
    selected,
  );
  assert.equal(
    view.body.find((block) => block.id === "total").value,
    selected.reduce((sum, row) => sum + row.accepted, 0),
  );
  const chart = view.body.find((block) => block.id === "daily");
  assert.deepEqual(
    chart.labels,
    selected.map((row) => row.day),
  );
  assert.deepEqual(
    chart.series[0].values,
    selected.map((row) => row.accepted),
  );
  assert.equal(view.datasetRows.observations, selected.length);
});

test("an empty linked selection still inspects and exports", (t) => {
  const { root, render, ok } = workspace(t);
  render(linkedDocument());
  const params = { station: "North", accepted: { max: 1 } };
  const view = inspectView(ok, params);
  assert.deepEqual(view.body.find((block) => block.id === "evidence").rows, []);
  assert.equal(view.body.find((block) => block.id === "total").value, 0);
  assert.equal(view.body.find((block) => block.id === "mean").value, "N/A");
  assert.deepEqual(view.body.find((block) => block.id === "daily").series, []);
  const out = join(root, "empty.png");
  ok([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--format",
    "png",
    "--out",
    out,
    "--params",
    JSON.stringify(params),
  ]);
  assert.ok(existsSync(out));
});

test("search, toggle and inclusive range controls compose on the same dataset", (t) => {
  const { render, ok } = workspace(t);
  const document = linkedDocument();
  render(document);
  const view = inspectView(ok, {
    day: "TUE",
    active: true,
    accepted: { min: 7, max: 11 },
  });
  const selected = document.datasets.observations.filter(
    (row) =>
      row.day === "Tue" &&
      row.active &&
      row.accepted >= 7 &&
      row.accepted <= 11,
  );
  assert.deepEqual(
    view.body.find((block) => block.id === "evidence").rows,
    selected,
  );
  assert.equal(
    view.body.find((block) => block.id === "total").value,
    selected.reduce((sum, row) => sum + row.accepted, 0),
  );
});

test("parameter exports rerender at the saved width and preserve the saved revision", (t) => {
  const { root, render, ok } = workspace(t);
  const entry = render(linkedDocument());
  const files = [entry.document, entry.png, entry.pdf];
  const before = files.map(digest);
  const versions = ok(["list"]).versions;
  const out = join(root, "north.png");
  ok([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--format",
    "png",
    "--out",
    out,
    "--params",
    JSON.stringify({ station: "North" }),
  ]);
  assert.notEqual(digest(out), digest(entry.png));
  assert.deepEqual(files.map(digest), before);
  assert.deepEqual(ok(["list"]).versions, versions);
});

test("select parameters distinguish scalar types and can clear a null default", (t) => {
  const { render, ok } = workspace(t);
  const document = linkedDocument();
  document.datasets.observations = [
    { station: 1, day: "Mon", accepted: 10 },
    { station: "1", day: "Tue", accepted: 20 },
    { station: null, day: "Wed", accepted: 30 },
    { day: "Thu", accepted: 40 },
  ];
  document.body = document.body.filter((block) => block.id !== "active");
  document.body[0].default = null;
  render(document);
  const expected = new Map([
    [1, 10],
    ["1", 20],
    [null, 70],
  ]);
  for (const [station, total] of expected)
    assert.equal(
      inspectView(ok, { station }).body.find((block) => block.id === "total")
        .value,
      total,
    );
  assert.equal(
    inspectView(ok).body.find((block) => block.id === "total").value,
    expected.get(null),
  );
  const all = document.datasets.observations.reduce(
    (sum, row) => sum + row.accepted,
    0,
  );
  assert.equal(
    inspectView(ok, { station: { all: true } }).body.find(
      (block) => block.id === "total",
    ).value,
    all,
  );
});

test("unknown parameters fail without writing an export", (t) => {
  const { root, render, run } = workspace(t);
  render(linkedDocument());
  const out = join(root, "unknown.png");
  const result = run([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--format",
    "png",
    "--out",
    out,
    "--params",
    JSON.stringify({ missing: "North" }),
  ]);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /params\.missing/);
  assert.equal(existsSync(out), false);
});

test("linked series preserve sparse categories without fabricating zero values", (t) => {
  const { render, ok } = workspace(t);
  const document = linkedDocument();
  document.datasets.observations = document.datasets.observations.filter(
    (row) =>
      row.station === "North" || (row.station === "South" && row.day === "Tue"),
  );
  document.body.find((block) => block.id === "daily").source.series = "station";
  document.body.find((block) => block.id === "daily").source.aggregate = "mean";
  render(document);
  const chart = inspectView(ok).body.find((block) => block.id === "daily");
  for (const series of chart.series) {
    const rows = document.datasets.observations.filter(
      (row) => row.station === series.name,
    );
    assert.deepEqual(
      series.values,
      rows.map((row) => row.accepted),
    );
    assert.deepEqual(
      series.x,
      rows.map((row) => chart.labels.indexOf(row.day)),
    );
  }
});

test("scatter bindings preserve duplicate coordinates and source order", (t) => {
  const { render, ok } = workspace(t);
  const document = linkedDocument();
  document.datasets.observations = [
    { station: "North", day: 2, accepted: 20, active: true },
    { station: "North", day: 1, accepted: 10, active: true },
    { station: "North", day: 2, accepted: 25, active: true },
  ];
  const chart = document.body.find((block) => block.id === "daily");
  chart.kind = "scatter";
  delete chart.source.aggregate;
  render(document);
  const series = inspectView(ok).body.find((block) => block.id === "daily")
    .series[0];
  assert.deepEqual(
    series.x,
    document.datasets.observations.map((row) => row.day),
  );
  assert.deepEqual(
    series.values,
    document.datasets.observations.map((row) => row.accepted),
  );
});
