import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  StandardFonts,
  setTextRenderingMode,
  TextRenderingMode,
} from "pdf-lib";
import { PNG } from "pngjs";
import ts from "typescript";
import { catalogue } from "../scripts/example-catalogue.mjs";

const examples = catalogue();
function blocks(values) {
  return values.flatMap((block) => [block, ...blocks(block.children ?? [])]);
}
function exportWorkspace(t) {
  const directory = mkdtempSync(join(tmpdir(), "visualize-export-regression-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    run(mode) {
      return spawnSync(
        process.execPath,
        [
          "scripts/examples.mjs",
          mode,
          "--only",
          "text",
          "--references",
          directory,
        ],
        { encoding: "utf8", timeout: 90_000, maxBuffer: 2 * 1024 * 1024 },
      );
    },
  };
}

test("the proposal reports image differences without treating PDF page counts as percentages", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "visualize-proposal-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const init = spawnSync(
    "git",
    ["init", "--quiet", "--initial-branch=main", directory],
    { encoding: "utf8" },
  );
  assert.equal(init.status, 0, init.stderr);
  for (const name of [
    ".cache/example-results",
    "docs",
    "examples/exports/linux",
  ])
    mkdirSync(join(directory, name), { recursive: true });
  writeFileSync(join(directory, "docs/decisions.md"), "# Decisions\n\n");
  writeFileSync(
    join(directory, "examples/exports/linux/index.md"),
    "Generated exports\n",
  );
  writeFileSync(
    join(directory, ".cache/example-results/changes.json"),
    JSON.stringify([
      {
        file: "pdf-only/light-390.pdf",
        status: "changed",
        detail: "3 → 4 pages",
      },
      {
        file: "image/light-390.png",
        status: "changed",
        detail: "1.25% pixels; 390 x 300 → 390 x 300",
      },
    ]),
  );
  const result = spawnSync(
    process.execPath,
    [resolve("scripts/visual-update-summary.mjs")],
    {
      cwd: directory,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const body = readFileSync(
    join(directory, ".cache/example-results/pull-request.md"),
    "utf8",
  );
  const percentage = (name) =>
    body
      .split("\n")
      .find((line) => line.startsWith(`| ${name} |`))
      .split("|")
      .at(-2)
      .trim();
  assert.equal(percentage("pdf-only"), "n/a");
  assert.equal(Number.parseFloat(percentage("image")), 1.25);
});

test("widget examples cover every supported block and enumerated kind", () => {
  const program = ts.createProgram(["src/model.ts"], {});
  const checker = program.getTypeChecker();
  const source = program.getSourceFile("src/model.ts");
  const alias = source.statements.find(
    (statement) =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === "Block",
  );
  const type = checker.getTypeAtLocation(alias);
  function strings(value) {
    return value?.isUnion()
      ? value.types.flatMap(strings)
      : value?.isStringLiteral()
        ? [value.value]
        : [];
  }
  const required = new Set();
  for (const member of type.isUnion() ? type.types : [type]) {
    const names = strings(checker.getTypeOfPropertyOfType(member, "type"));
    const kinds = strings(checker.getTypeOfPropertyOfType(member, "kind"));
    for (const name of names) {
      required.add(name);
      for (const kind of kinds) required.add(`${name}:${kind}`);
    }
  }
  const shown = new Set(
    examples
      .flatMap(({ document }) => blocks(document.body))
      .flatMap((block) => [
        block.type,
        ...(block.kind ? [`${block.type}:${block.kind}`] : []),
      ]),
  );
  assert.deepEqual(
    [...required].filter((name) => !shown.has(name)),
    [],
  );
  const all = examples.flatMap(({ document }) => blocks(document.body));
  for (const [name, values] of [
    ["Tone", all.map((block) => block.tone)],
    [
      "ImageFit",
      all.filter((block) => block.type === "image").map((block) => block.fit),
    ],
    ["Aggregate", all.map((block) => block.source?.aggregate)],
  ]) {
    const definition = source.statements.find(
      (statement) =>
        ts.isTypeAliasDeclaration(statement) && statement.name.text === name,
    );
    assert.deepEqual(
      strings(checker.getTypeAtLocation(definition)).filter(
        (value) => !values.includes(value),
      ),
      [],
      name,
    );
  }
});

for (const { name, source } of examples) {
  test(`the ${name} example is accepted by the public CLI`, () => {
    const result = spawnSync(
      resolve(process.env.VISUALIZE_TEST_BINARY ?? "dist/bin/visualize"),
      ["validate", "--file", source],
      {
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).valid, true);
  });
}

test("export checks tolerate encoding differences and isolated raster rounding", async (t) => {
  const { directory, run } = exportWorkspace(t);
  const update = run("update");
  assert.equal(update.status, 0, update.stderr);
  const pngFile = join(directory, "text/light-1280.png");
  const png = PNG.sync.read(readFileSync(pngFile));
  png.data[0] ^= 1;
  writeFileSync(pngFile, PNG.sync.write(png));
  const pdfFile = join(directory, "text/light-1280.pdf");
  const pdf = await PDFDocument.load(readFileSync(pdfFile), {
    updateMetadata: false,
  });
  pdf.setProducer("Fixture export encoder");
  writeFileSync(pdfFile, await pdf.save({ useObjectStreams: false }));
  const check = run("check");
  assert.equal(check.status, 0, check.stdout + check.stderr);
});

test("export checks reject widespread one-level color changes", (t) => {
  const { directory, run } = exportWorkspace(t);
  const update = run("update");
  assert.equal(update.status, 0, update.stderr);
  const file = join(directory, "text/light-1280.png");
  const png = PNG.sync.read(readFileSync(file));
  for (let pixel = 0; pixel < png.data.length; pixel += 4) png.data[pixel] ^= 1;
  writeFileSync(file, PNG.sync.write(png));
  const check = run("check");
  assert.equal(check.status, 1, check.stdout + check.stderr);
  const changes = JSON.parse(
    readFileSync(".cache/example-results/changes.json", "utf8"),
  );
  assert.deepEqual(
    changes.map(({ file }) => file),
    ["text/light-1280.png"],
  );
});

test("export checks reject changed searchable text even when PDF appearance matches", async (t) => {
  const { directory, run } = exportWorkspace(t);
  const update = run("update");
  assert.equal(update.status, 0, update.stderr);
  const file = join(directory, "text/light-1280.pdf");
  const original = readFileSync(file);
  const pdf = await PDFDocument.load(original, { updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPages()[0];
  page.pushOperators(
    pushGraphicsState(),
    setTextRenderingMode(TextRenderingMode.Invisible),
  );
  page.drawText("Unexpected searchable label", {
    x: 10,
    y: 10,
    size: 12,
    font,
  });
  page.pushOperators(popGraphicsState());
  writeFileSync(file, await pdf.save());
  const baseline = join(directory, "original.pdf");
  writeFileSync(baseline, original);
  function pixels(file) {
    return PNG.sync.read(
      execFileSync("pdftoppm", ["-singlefile", "-png", "-r", "96", file], {
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
      }),
    ).data;
  }
  assert.deepEqual(pixels(file), pixels(baseline));
  rmSync(baseline);
  const check = run("check");
  assert.equal(check.status, 1, check.stdout + check.stderr);
  const changes = JSON.parse(
    readFileSync(".cache/example-results/changes.json", "utf8"),
  );
  assert.deepEqual(
    changes.map(({ file }) => file),
    ["text/light-1280.pdf"],
  );
});

test("export updates are repeatable and regression checks reject changed or stale files", async (t) => {
  const { directory, run } = exportWorkspace(t);
  const update = run("update");
  assert.equal(update.status, 0, update.stderr);
  const check = run("check");
  assert.equal(check.status, 0, check.stdout + check.stderr);
  const html = join(directory, "text/light-1280.html");
  writeFileSync(
    html,
    readFileSync(html, "utf8").replace(
      "Plain text wraps",
      "Changed text wraps",
    ),
  );
  writeFileSync(join(directory, "text/obsolete.txt"), "obsolete");
  const pngFile = join(directory, "text/light-1280.png");
  const png = PNG.sync.read(readFileSync(pngFile));
  png.data[0] ^= 255;
  writeFileSync(pngFile, PNG.sync.write(png));
  const pdfFile = join(directory, "text/light-1280.pdf");
  const pdf = await PDFDocument.load(readFileSync(pdfFile));
  pdf.addPage();
  writeFileSync(pdfFile, await pdf.save());
  const rejected = run("check");
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  const changes = JSON.parse(
    readFileSync(".cache/example-results/changes.json", "utf8"),
  );
  assert.ok(
    changes.some(
      (change) =>
        change.file === "text/light-1280.html" && change.status === "changed",
    ),
  );
  assert.ok(
    changes.some(
      (change) =>
        change.file === "text/obsolete.txt" && change.status === "removed",
    ),
  );
  assert.ok(
    changes.some(
      (change) =>
        change.file.endsWith(".png") && change.detail.includes("% pixels"),
    ),
  );
  assert.ok(
    changes.some(
      (change) =>
        change.file.endsWith(".pdf") && change.detail.includes("pages"),
    ),
  );
  const fixed = run("update");
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.equal(run("check").status, 0);
});
