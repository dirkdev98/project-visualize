import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import {
  appearances,
  catalogue,
  exportIndex,
  root,
} from "./example-catalogue.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: "string" },
    references: { type: "string" },
    shard: { type: "string" },
  },
});
const mode = positionals[0];
if (positionals.length !== 1 || !["check", "update"].includes(mode))
  throw new Error(
    "Use examples.mjs check|update [--only NAME] [--references DIRECTORY] [--shard INDEX/TOTAL]",
  );
const examples = catalogue();
const partition = values.shard?.match(/^([1-9]\d*)\/([1-9]\d*)$/);
if (
  values.shard &&
  (!partition || Number(partition[1]) > Number(partition[2]) || values.only)
)
  throw new Error(
    "Use --shard INDEX/TOTAL with 1 <= INDEX <= TOTAL, without --only",
  );
const index = partition ? Number(partition[1]) : undefined;
const total = partition ? Number(partition[2]) : undefined;
const selected = examples.filter(
  ({ name }, at) =>
    (!values.only || name === values.only) &&
    (index === undefined || at % total === index - 1),
);
if (!selected.length) throw new Error(`Unknown example: ${values.only}`);
const references = resolve(
  values.references ?? join(root, "examples/exports", process.platform),
);
const reportRoot = join(root, ".cache/example-results");
const report =
  index === undefined ? reportRoot : join(reportRoot, `shard-${index}`);
const actual = join(report, "actual");
if (index === 1) rmSync(reportRoot, { recursive: true, force: true });
rmSync(report, { recursive: true, force: true });
mkdirSync(actual, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "visualize-examples-"));
const binary = resolve(
  process.env.VISUALIZE_TEST_BINARY ?? join(root, "dist/bin/visualize"),
);
function cli(args) {
  return JSON.parse(
    execFileSync(binary, [...args, "--store", join(scratch, "library")], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    }),
  );
}
function files(directory, prefix = "") {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const name = join(prefix, entry.name);
      return entry.isDirectory()
        ? files(join(directory, entry.name), name)
        : [name];
    })
    .sort();
}
function pixelDifference(before, after, destination) {
  const a = PNG.sync.read(readFileSync(before));
  const b = PNG.sync.read(readFileSync(after));
  const width = Math.max(a.width, b.width),
    height = Math.max(a.height, b.height);
  const diff = new PNG({ width, height });
  let changed = 0,
    maximumChannelDelta = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const ai = (y * a.width + x) * 4,
        bi = (y * b.width + x) * 4;
      const insideA = x < a.width && y < a.height,
        insideB = x < b.width && y < b.height;
      let different = !insideA || !insideB;
      if (insideA && insideB)
        for (let channel = 0; channel < 4; channel++) {
          const delta = Math.abs(a.data[ai + channel] - b.data[bi + channel]);
          maximumChannelDelta = Math.max(maximumChannelDelta, delta);
          if (delta) different = true;
        }
      const out = (y * width + x) * 4;
      if (different) {
        changed++;
        diff.data.set([220, 38, 75, 255], out);
      } else {
        const gray = Math.round(
          (b.data[bi] + b.data[bi + 1] + b.data[bi + 2]) / 3,
        );
        diff.data.set([gray, gray, gray, 90], out);
      }
    }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, PNG.sync.write(diff));
  return {
    dimensionsMatch: a.width === b.width && a.height === b.height,
    maximumChannelDelta,
    changedPixels: changed,
    pixels: width * height,
    ratio: changed / (width * height),
    detail: `${((100 * changed) / (width * height)).toFixed(4)}% pixels; ${a.width} x ${a.height} → ${b.width} x ${b.height}`,
  };
}
function rasterRoundingOnly(difference) {
  // Software rasterizers can round an isolated channel differently across CPUs.
  return (
    difference.dimensionsMatch &&
    difference.maximumChannelDelta <= 1 &&
    difference.ratio <= 0.0002
  );
}
function pdfDifference(before, after, destination) {
  const directory = mkdtempSync(join(scratch, "pdf-"));
  try {
    const pages = [],
      text = [];
    for (const [name, file] of [
      ["before", before],
      ["after", after],
    ]) {
      execFileSync(
        "pdftoppm",
        [
          "-png",
          "-r",
          "96",
          "-aa",
          "yes",
          "-aaVector",
          "yes",
          file,
          join(directory, name),
        ],
        { timeout: 60_000, stdio: "pipe" },
      );
      pages.push(
        files(directory)
          .filter(
            (file) => file.startsWith(`${name}-`) && file.endsWith(".png"),
          )
          .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
          .map((file) => join(directory, file)),
      );
      const extracted = execFileSync(
        "pdftotext",
        ["-bbox-layout", "-enc", "UTF-8", file, "-"],
        { encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
      ).match(/<doc>[\s\S]*<\/doc>/)?.[0];
      if (!extracted)
        throw new Error(`PDF text bounds are unavailable: ${file}`);
      text.push(extracted);
    }
    const sameText = text[0] === text[1];
    let dimensionsMatch = pages[0].length === pages[1].length,
      maximumChannelDelta = 0,
      changedPixels = 0,
      pixels = 0;
    for (
      let page = 0;
      page < Math.min(pages[0].length, pages[1].length);
      page++
    ) {
      const difference = pixelDifference(
        pages[0][page],
        pages[1][page],
        join(destination, `page-${page + 1}.png`),
      );
      dimensionsMatch &&= difference.dimensionsMatch;
      maximumChannelDelta = Math.max(
        maximumChannelDelta,
        difference.maximumChannelDelta,
      );
      changedPixels += difference.changedPixels;
      pixels += difference.pixels;
    }
    const equivalent =
      sameText &&
      rasterRoundingOnly({
        dimensionsMatch,
        maximumChannelDelta,
        ratio: changedPixels / pixels,
      });
    if (equivalent) rmSync(destination, { recursive: true, force: true });
    else
      for (const [index, kind] of ["before", "after"].entries()) {
        mkdirSync(join(destination, kind), { recursive: true });
        for (const [page, file] of pages[index].entries())
          copyFileSync(file, join(destination, kind, `page-${page + 1}.png`));
      }
    return {
      equivalent,
      detail: `${pages[0].length} → ${pages[1].length} pages${sameText ? "" : "; searchable text or positions changed"}`,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
let browser;
const changes = [];
try {
  browser = await chromium.launch();
  for (const { name, source } of selected)
    for (const { theme, width } of appearances) {
      const directory = join(actual, name);
      mkdirSync(directory, { recursive: true });
      const stem = join(directory, `${theme}-${width}`);
      const entry = cli([
        "render",
        "--project",
        "examples",
        "--artifact",
        name,
        "--file",
        source,
        "--theme",
        theme,
        "--width",
        String(width),
        "--scale",
        "1",
      ]);
      copyFileSync(entry.png, `${stem}.png`);
      copyFileSync(entry.pdf, `${stem}.pdf`);
      cli([
        "export",
        "--project",
        entry.project,
        "--artifact",
        entry.artifact,
        "--version",
        entry.version,
        "--format",
        "html",
        "--out",
        `${stem}.html`,
        "--width",
        String(width),
      ]);
      // Saved revisions have unique identities; catalogue exports describe the source example.
      const html = readFileSync(`${stem}.html`, "utf8").replaceAll(
        entry.version,
        "example",
      );
      writeFileSync(`${stem}.html`, html);
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const errors = [],
        requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("request", (request) => {
        if (/^https?:/.test(request.url())) requests.push(request.url());
      });
      await page.goto(pathToFileURL(`${stem}.html`).href);
      await page.locator("#visualize[data-ready=true]").waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (errors.length || requests.length)
        throw new Error(
          `${name} ${theme} ${width}: ${JSON.stringify({ errors, requests })}`,
        );
      await page
        .locator("#visualize")
        .screenshot({ path: `${stem}.browser.png` });
      await page.close();
      console.log(`${name} ${theme} ${width}`);
    }
  writeFileSync(join(actual, "index.md"), exportIndex(examples));
  const relevant = (name) => {
    if (values.only)
      return name === "index.md" || name.startsWith(`${values.only}/`);
    if (index === undefined || name === "index.md") return true;
    const owner = name.split("/")[0];
    return (
      selected.some((example) => example.name === owner) ||
      (index === 1 && !examples.some((example) => example.name === owner))
    );
  };
  const names = new Set([
    ...files(actual),
    ...files(references).filter(relevant),
  ]);
  for (const name of [...names].sort()) {
    const before = join(references, name),
      after = join(actual, name);
    const old = existsSync(before),
      current = existsSync(after);
    if (old && current && readFileSync(before).equals(readFileSync(after)))
      continue;
    const change = {
      file: name,
      status: !old ? "added" : !current ? "removed" : "changed",
      detail: "",
    };
    if (old && current && name.endsWith(".png")) {
      const difference = pixelDifference(
        before,
        after,
        join(report, "diff", name),
      );
      const html = name.replace(/\.browser\.png$/, ".html");
      const htmlMatches =
        name.endsWith(".browser.png") &&
        existsSync(join(references, html)) &&
        existsSync(join(actual, html)) &&
        readFileSync(join(references, html)).equals(
          readFileSync(join(actual, html)),
        );
      // Native form controls can vary by a few corner pixels with identical HTML.
      if (
        rasterRoundingOnly(difference) ||
        (htmlMatches &&
          difference.dimensionsMatch &&
          difference.ratio <= 0.0001)
      ) {
        rmSync(join(report, "diff", name));
        continue;
      }
      change.detail = difference.detail;
    }
    if (old && current && name.endsWith(".pdf")) {
      const difference = pdfDifference(
        before,
        after,
        join(report, "diff", name.replace(/\.pdf$/, "-pdf")),
      );
      if (difference.equivalent) continue;
      change.detail = difference.detail;
    }
    for (const [kind, file, present] of [
      ["before", before, old],
      ["after", after, current],
    ])
      if (present) {
        const output = join(report, kind, name);
        mkdirSync(dirname(output), { recursive: true });
        copyFileSync(file, output);
      }
    changes.push(change);
  }
  writeFileSync(
    join(report, "changes.json"),
    `${JSON.stringify(changes, null, 2)}\n`,
  );
  const combined =
    index === undefined
      ? changes
      : readdirSync(reportRoot)
          .filter(
            (name) =>
              /^shard-\d+$/.test(name) &&
              existsSync(join(reportRoot, name, "changes.json")),
          )
          .flatMap((name) =>
            JSON.parse(
              readFileSync(join(reportRoot, name, "changes.json"), "utf8"),
            ),
          );
  const summary = [
    `Generated widget exports differ in ${combined.length} files on ${process.platform}.`,
    "",
    "| File | Change | Rendering difference |",
    "| --- | --- | --- |",
    ...combined.map(
      ({ file, status, detail }) => `| ${file} | ${status} | ${detail} |`,
    ),
    "",
    "The workflow artifact includes complete before/after exports and PNG difference images.",
    "HTML is opened offline in Chromium; PDF entries retain selectable text.",
    "",
  ].join("\n");
  writeFileSync(join(reportRoot, "summary.md"), summary);
  writeFileSync(
    join(reportRoot, "changes.json"),
    `${JSON.stringify(combined, null, 2)}\n`,
  );
  if (mode === "update") {
    for (const { file, status } of changes) {
      const destination = join(references, file);
      if (status === "removed") rmSync(destination);
      else {
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(actual, file), destination);
      }
    }
  } else if (changes.length) process.exitCode = 1;
  console.log(
    `${changes.length} export differences; ${relative(root, join(reportRoot, "summary.md"))}`,
  );
} finally {
  try {
    await browser?.close();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
