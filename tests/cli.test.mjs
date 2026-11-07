import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
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
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";

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

test("desktop and mobile screenshots share one immutable revision at high resolution", (t) => {
  const { root, ok } = workspace(t);
  const document = {
    ...minimal(),
    body: [
      {
        type: "row",
        children: [
          { type: "metric", label: "Accepted", value: 42 },
          {
            type: "table",
            columns: [
              { key: "station", label: "Station" },
              { key: "accepted", label: "Accepted" },
              { key: "note", label: "Observation note" },
            ],
            rows: [
              {
                station: "Cedar station",
                accepted: 42,
                note: "Fictional complete evidence remains readable on a phone.",
              },
            ],
          },
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
      "responsive",
      "--file",
      "-",
      "--mobile-width",
      "390",
    ],
    document,
  );
  assert.equal(entry.scale, 2);
  assert.equal(
    readFileSync(entry.screenshots.desktop).readUInt32BE(16),
    entry.width * entry.scale,
  );
  assert.equal(
    readFileSync(entry.screenshots.mobile).readUInt32BE(16),
    entry.mobile.width * entry.scale,
  );
  assert.equal(
    readFileSync(entry.screenshots.mobile).readUInt32BE(20),
    entry.mobile.height * entry.scale,
  );
  assert.deepEqual(JSON.parse(readFileSync(entry.document, "utf8")), document);
  const before = [
    entry.document,
    entry.png,
    entry.pdf,
    entry.screenshots.mobile,
  ].map(digest);
  const pdf = join(root, "phone.pdf");
  ok([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "responsive",
    "--version",
    entry.version,
    "--width",
    "390",
    "--format",
    "pdf",
    "--out",
    pdf,
  ]);
  const content = spawnSync("pdftotext", ["-layout", pdf, "-"], {
    encoding: "utf8",
  });
  assert.equal(content.status, 0, content.stderr);
  for (const value of [
    "Cedar station",
    "42",
    "Fictional complete evidence remains readable on a phone.",
  ])
    assert.ok(content.stdout.replace(/\s+/g, " ").includes(value));
  assert.deepEqual(
    [entry.document, entry.png, entry.pdf, entry.screenshots.mobile].map(
      digest,
    ),
    before,
  );
});

test("explicit single-density screenshots retain logical dimensions", (t) => {
  const { ok } = workspace(t);
  const entry = ok(
    [
      "render",
      "--project",
      "orbital",
      "--artifact",
      "single",
      "--file",
      "-",
      "--width",
      "320",
      "--scale",
      "1",
    ],
    minimal(),
  );
  assert.equal(readFileSync(entry.png).readUInt32BE(16), entry.width);
  assert.equal(entry.scale, 1);
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

async function pdfBookmarks(file) {
  const pdf = await PDFDocument.load(readFileSync(file));
  const pages = pdf.getPages(),
    visited = new Set();
  const root = pdf.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict);
  function siblings(first) {
    const result = [];
    for (let reference = first; reference; ) {
      assert.ok(
        !visited.has(reference.toString()),
        "The bookmark tree contains a cycle",
      );
      visited.add(reference.toString());
      const node = pdf.context.lookup(reference, PDFDict);
      const destination = node.lookup(PDFName.of("Dest"), PDFArray);
      const page = pages.findIndex(
        (page) => page.ref.toString() === destination.get(0).toString(),
      );
      assert.ok(page >= 0, "A bookmark points outside the document");
      const top = destination.lookup(3).asNumber();
      assert.ok(top > 0 && top < pages[page].getHeight());
      result.push({
        title: node.lookup(PDFName.of("Title")).decodeText(),
        page,
        children: siblings(node.get(PDFName.of("First"))),
      });
      reference = node.get(PDFName.of("Next"));
    }
    return result;
  }
  return root ? siblings(root.get(PDFName.of("First"))) : [];
}

test("PDF bookmarks follow rendered section hierarchy and destination pages", async (t) => {
  const { render } = workspace(t);
  const overview = "OVERVIEW Ω",
    detail = "DETAILS café & signal source",
    appendix = "APPENDIX Ω",
    source = "SOURCE_REFERENCE";
  const evidence = Array.from(
    { length: 26 },
    (_, i) =>
      `Fictional observation ${i} retains its source, matched operating hours and review assumptions.`,
  ).join("\n\n");
  const entry = render({
    ...minimal(),
    body: [
      {
        type: "markdown",
        content: `# ${overview}\n\n${evidence}\n\n## DETAILS **café** &amp; \`signal\` [source](https://example.com/evidence)\n\nThe final finding preserves the evidence.`,
      },
      {
        type: "details",
        title: appendix,
        pageBreakBefore: true,
        children: [
          {
            type: "markdown",
            content: `### ${source}\n\nRetain this original fictional source.`,
          },
        ],
      },
    ],
  });
  const text = pdfTextPages(entry.pdf);
  const pageOf = (marker) => {
    const page = text.findIndex((page) => page.includes(marker));
    assert.ok(page >= 0, marker);
    return page;
  };
  assert.ok(pageOf("DETAILS") > pageOf(overview));
  assert.deepEqual(await pdfBookmarks(entry.pdf), [
    {
      title: overview,
      page: pageOf(overview),
      children: [{ title: detail, page: pageOf("DETAILS"), children: [] }],
    },
    {
      title: appendix,
      page: pageOf(appendix),
      children: [{ title: source, page: pageOf(source), children: [] }],
    },
  ]);
});

test("PDF bookmarks target heading text after continued tables at either density", async (t) => {
  const { ok } = workspace(t);
  for (const [width, scale, theme] of [
    [1280, 1, "light"],
    [1024, 2, "dark"],
    [480, 1, "light"],
  ]) {
    const entry = ok(
      [
        "render",
        "--project",
        "orbital",
        "--artifact",
        "review",
        "--file",
        "-",
        "--width",
        String(width),
        "--scale",
        String(scale),
      ],
      {
        ...minimal(),
        theme,
        body: [
          {
            type: "table",
            columns: [{ key: "observation", label: "Station evidence" }],
            rows: Array.from({ length: 77 }, (_, i) => ({
              observation: `RECORD_${i}`,
            })),
          },
          {
            type: "markdown",
            content:
              "## DESTINATION_HEADING\n\nKeep the next review beside this evidence.",
          },
        ],
      },
    );
    const pdf = await PDFDocument.load(readFileSync(entry.pdf));
    const root = pdf.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    const node = root.lookup(PDFName.of("First"), PDFDict);
    const destination = node.lookup(PDFName.of("Dest"), PDFArray);
    const page = pdf
      .getPages()
      .findIndex(
        (page) => page.ref.toString() === destination.get(0).toString(),
      );
    const extraction = spawnSync("pdftotext", ["-bbox", entry.pdf, "-"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.ifError(extraction.error);
    assert.equal(extraction.status, 0, extraction.stderr);
    const pages = [
      ...extraction.stdout.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g),
    ];
    const word = [
      ...pages[page][1].matchAll(
        /<word\b[^>]*yMin="([^"]+)"[^>]*yMax="([^"]+)"[^>]*>([^<]*)<\/word>/g,
      ),
    ].find((word) => word[3] === "DESTINATION_HEADING");
    assert.ok(word, "The bookmark destination does not contain its heading");
    const inkTop = pdf.getPages()[page].getHeight() - Number(word[1]);
    const gap = destination.lookup(3).asNumber() - inkTop;
    assert.ok(
      gap >= 0 && gap <= Number(word[2]) - Number(word[1]),
      "The bookmark must open just above the heading's first visible glyph",
    );
  }
});

test("parallel cards and separate Markdown blocks keep independent bookmarks", async (t) => {
  const { render } = workspace(t);
  const entry = render({
    ...minimal(),
    body: [
      {
        type: "row",
        children: [
          {
            type: "card",
            title: "LEFT_SECTION",
            children: [
              {
                type: "markdown",
                content:
                  "# LEFT_PRIMARY\n\nEvidence.\n\n## REPEATED_TITLE\n\nMore evidence.",
              },
              {
                type: "markdown",
                content: "### SEPARATE_SECTION\n\nIndependent section.",
              },
            ],
          },
          {
            type: "card",
            children: [
              {
                type: "markdown",
                content: "### UNTITLED_COLUMN\n\nIndependent column.",
              },
            ],
          },
          {
            type: "card",
            title: "RIGHT_SECTION",
            children: [
              {
                type: "markdown",
                content: "## REPEATED_TITLE\n\nSeparate evidence.",
              },
            ],
          },
        ],
      },
    ],
  });
  const bookmark = (title, children = []) => ({ title, page: 0, children });
  assert.deepEqual(await pdfBookmarks(entry.pdf), [
    bookmark("LEFT_SECTION", [
      bookmark("LEFT_PRIMARY", [bookmark("REPEATED_TITLE")]),
      bookmark("SEPARATE_SECTION"),
    ]),
    bookmark("UNTITLED_COLUMN"),
    bookmark("RIGHT_SECTION", [bookmark("REPEATED_TITLE")]),
  ]);
});

test("Markdown headings stay with the first following body line in a long report", (t) => {
  const { ok } = workspace(t);
  const sections = Array.from({ length: 10 }, (_, i) => {
    const marker = String(i).padStart(2, "0");
    return {
      heading: `SECTION_${marker}`,
      body: `BODY_${marker}`,
      subheading: i === 7 ? "DETAIL_07" : "",
    };
  });
  const content = sections
    .map(
      ({ heading, body, subheading }) =>
        `## ${heading}\n\n${subheading ? `### ${subheading}\n\n` : ""}${body} begins this fictional station finding. ${"The review preserves observations and records the evidence for the next inspection. ".repeat(5)}`,
    )
    .join("\n\n");
  const entry = ok(
    [
      "render",
      "--project",
      "orbital",
      "--artifact",
      "review",
      "--file",
      "-",
      "--width",
      "480",
    ],
    {
      ...minimal(),
      title: "Fictional section pagination study",
      theme: "dark",
      body: [{ type: "markdown", content }],
    },
  );
  const pages = pdfTextPages(entry.pdf);
  assert.ok(pages.length > 1);
  for (const { heading, body, subheading } of sections) {
    const page = pages.find((page) => page.includes(body));
    assert.ok(page?.includes(heading), `Orphaned heading: ${heading}`);
    if (subheading) assert.ok(page?.includes(subheading));
    assert.equal(pages.join(" ").split(body).length - 1, 1, body);
  }
});

test("titled cards keep their first timeline entry on the same PDF page", (t) => {
  const { ok } = workspace(t);
  const document = JSON.parse(
    readFileSync(resolve("examples/components.json"), "utf8"),
  );
  const card = document.body
    .flatMap((block) => block.children ?? [])
    .find(
      (block) =>
        block.type === "card" && block.children[0]?.type === "timeline",
    );
  assert.ok(card);
  const firstEvent = card.children[0].events[0];
  for (const [theme, scale] of [
    ["light", "1"],
    ["dark", "2"],
  ]) {
    const entry = ok(
      [
        "render",
        "--project",
        "orbital",
        "--artifact",
        "review",
        "--file",
        "-",
        "--width",
        "640",
        "--scale",
        scale,
      ],
      { ...document, theme },
    );
    const pages = pdfTextPages(entry.pdf);
    assert.ok(pages.length > 1);
    const page = pages.find((page) => page.includes(card.title));
    assert.ok(
      page?.includes(firstEvent.title),
      `Orphaned card title in ${theme}`,
    );
    assert.ok(page.includes(firstEvent.label));
  }
});

test("authored PDF sections start on fresh pages without changing the PNG", (t) => {
  const { render } = workspace(t);
  const body = [
    {
      type: "markdown",
      content:
        "## FINDING_SECTION\n\nA fictional station improved its accepted observations.",
    },
    {
      type: "card",
      title: "EVIDENCE_SECTION",
      children: [
        {
          type: "text",
          content: "Preserve the matched operating hours with this decision.",
        },
      ],
    },
  ];
  const continuous = render({ ...minimal(), body });
  const divided = render({
    ...minimal(),
    body: [body[0], { ...body[1], pageBreakBefore: true }],
  });
  const cover = render({
    ...minimal(),
    body: [{ ...body[0], pageBreakBefore: true }, body[1]],
  });
  const pages = pdfTextPages(divided.pdf);
  assert.equal(pdfTextPages(continuous.pdf).length, 1);
  assert.equal(pages.length, 2);
  assert.ok(pages[0].includes("FINDING_SECTION"));
  assert.ok(!pages[0].includes("EVIDENCE_SECTION"));
  assert.ok(pages[1].includes("EVIDENCE_SECTION"));
  const coverPages = pdfTextPages(cover.pdf);
  assert.equal(coverPages.length, 2);
  assert.ok(!coverPages[0].includes("FINDING_SECTION"));
  assert.ok(coverPages[1].includes("FINDING_SECTION"));
  assert.equal(digest(continuous.png), digest(divided.png));
  assert.equal(digest(continuous.png), digest(cover.png));
});

test("an authored section follows a continued table without repeating its heading", (t) => {
  const { render } = workspace(t);
  const markers = Array.from(
    { length: 70 },
    (_, i) => `OBSERVATION_${String(i).padStart(3, "0")}`,
  );
  const entry = render({
    ...minimal(),
    body: [
      {
        type: "table",
        columns: [{ key: "observation", label: "TABLE_EVIDENCE" }],
        rows: markers.map((observation) => ({ observation })),
      },
      {
        type: "markdown",
        pageBreakBefore: true,
        content:
          "## APPENDIX_SECTION\n\nAPPENDIX_BODY preserves the original assumptions.",
      },
    ],
  });
  const pages = pdfTextPages(entry.pdf);
  assertTableContinuation(pages, "TABLE_EVIDENCE", markers);
  const appendix = pages.findIndex((page) => page.includes("APPENDIX_SECTION"));
  assert.equal(appendix, pages.length - 1);
  assert.ok(pages[appendix].includes("APPENDIX_BODY"));
  assert.ok(!pages[appendix].includes("TABLE_EVIDENCE"));
  assert.ok(!markers.some((marker) => pages[appendix].includes(marker)));
});

test("a break before trailing padding does not create a blank PDF page", (t) => {
  const { render } = workspace(t);
  const entry = render({
    ...minimal(),
    body: [
      { type: "text", content: "The final evidence remains on one page." },
      { type: "spacer", height: 300, pageBreakBefore: true },
    ],
  });
  assert.equal(pdfTextPages(entry.pdf).length, 1);
});

test("nested and nonboolean page breaks fail before publishing", (t) => {
  const { run, ok } = workspace(t);
  for (const body of [
    [{ type: "text", pageBreakBefore: "true", content: "Evidence" }],
    [
      {
        type: "row",
        children: [
          { type: "text", pageBreakBefore: true, content: "Evidence" },
          { type: "text", content: "Comparison" },
        ],
      },
    ],
  ]) {
    const result = run(
      ["render", "--project", "orbital", "--artifact", "review", "--file", "-"],
      { ...minimal(), body },
    );
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stderr).error, /pageBreakBefore/);
  }
  assert.deepEqual(ok(["list"]).versions, []);
});

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

test("image frames distinguish contain and cover while preserving saved assets", (t) => {
  const { root, render, ok } = workspace(t);
  const image = join(root, "station.png");
  writeFileSync(
    image,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const document = {
    ...minimal(),
    assets: { station: image },
    body: [{ type: "image", asset: "station", height: 120 }],
  };
  const contain = render(document);
  const cover = render({
    ...document,
    body: [{ ...document.body[0], fit: "cover" }],
  });
  assert.notEqual(digest(contain.png), digest(cover.png));
  rmSync(image);
  const output = join(root, "saved-frame.png");
  ok([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--version",
    cover.version,
    "--format",
    "png",
    "--out",
    output,
  ]);
  assert.equal(digest(output), digest(cover.png));
});

test("invalid image fit and empty frames fail before publishing a version", (t) => {
  const { run, ok } = workspace(t);
  for (const option of [{ fit: "stretch" }, { height: 0 }, { height: -1 }]) {
    const result = run(
      ["render", "--project", "orbital", "--artifact", "review", "--file", "-"],
      {
        ...minimal(),
        assets: { station: "absent.png" },
        body: [{ type: "image", asset: "station", ...option }],
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /body\[0\]\.(fit|height)/);
  }
  assert.deepEqual(ok(["list"]).versions, []);
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

for (const name of readdirSync(resolve("examples")).filter((name) =>
  name.endsWith(".json"),
)) {
  test(`the ${name} authoring example renders through the CLI`, (t) => {
    const { ok } = workspace(t);
    const entry = ok([
      "render",
      "--project",
      "examples",
      "--artifact",
      name.slice(0, -5),
      "--file",
      resolve("examples", name),
    ]);
    assert.ok(existsSync(entry.png));
    assert.ok(existsSync(entry.pdf));
  });
}

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

test("table number formats preserve raw values and nonnumeric cells", (t) => {
  const { render, ok } = workspace(t);
  const rows = [
    { station: "North", amount: 1234.5 },
    { station: "South", amount: -28 },
    { station: "West", amount: "Pending" },
    { station: "East", amount: null },
    { station: "Central", amount: true },
  ];
  const document = {
    ...minimal(),
    body: [
      {
        type: "table",
        columns: [
          { key: "station", label: "Station" },
          {
            key: "amount",
            label: "Amount",
            align: "right",
            weight: 2,
            format: { decimals: 2, prefix: "$", suffix: " credits" },
          },
        ],
        rows,
      },
    ],
  };
  const entry = render(document);
  const text = pdfTextPages(entry.pdf).join(" ");
  for (const value of [
    "$1,234.50 credits",
    "$-28.00 credits",
    "Pending",
    "true",
  ])
    assert.ok(text.includes(value), value);
  assert.ok(!text.includes("$Pending"));
  assert.ok(!text.includes("$true"));
  assert.ok(!text.includes("$null"));
  assert.deepEqual(inspectView(ok).body[0].rows, rows);
  assert.deepEqual(JSON.parse(readFileSync(entry.document, "utf8")), document);
});

test("invalid table presentation options fail before publishing", (t) => {
  const { run, ok } = workspace(t);
  for (const options of [
    { align: "center" },
    { weight: 0 },
    { weight: -1 },
    { weight: "2" },
    { weight: 101 },
    { format: null },
    { format: { decimals: 1.5 } },
    { format: { decimals: 9 } },
    { format: { prefix: 1 } },
    { format: { suffix: "x".repeat(81) } },
  ]) {
    const result = run(
      ["render", "--project", "orbital", "--artifact", "review", "--file", "-"],
      {
        ...minimal(),
        body: [
          {
            type: "table",
            columns: [{ key: "amount", label: "Amount", ...options }],
            rows: [{ amount: 1 }],
          },
        ],
      },
    );
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stderr).error, /columns\[0\]/);
  }
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

function heatmapDocument() {
  return {
    ...minimal(),
    datasets: {
      observations: [
        { day: "Mon", station: "North", reading: 0 },
        { day: "Mon", station: "North", reading: 10 },
        { day: "Tue", station: "North", reading: 20 },
        { day: "Mon", station: "South", reading: null },
        { day: "Tue", station: "South", reading: -4 },
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
        type: "heatmap",
        id: "readings",
        source: {
          dataset: "observations",
          x: "day",
          y: "station",
          field: "reading",
          aggregate: "mean",
        },
      },
    ],
  };
}

test("linked heatmaps aggregate populated cells and retain missing observations", (t) => {
  const { render, ok } = workspace(t);
  render(heatmapDocument());
  const heatmap = inspectView(ok).body.find(
    (block) => block.type === "heatmap",
  );
  assert.deepEqual(heatmap.x, ["Mon", "Tue"]);
  assert.deepEqual(heatmap.y, ["North", "South"]);
  assert.deepEqual(heatmap.values, [
    [5, 20],
    [null, -4],
  ]);
  const selected = inspectView(ok, { station: "North" }).body.find(
    (block) => block.type === "heatmap",
  );
  assert.deepEqual(selected.x, heatmap.x);
  assert.deepEqual(selected.y, heatmap.y);
  assert.deepEqual(selected.values, [
    [5, 20],
    [null, null],
  ]);
  assert.deepEqual([selected.min, selected.max], [heatmap.min, heatmap.max]);
});

test("heatmap sum preserves observed zero while an absent pair stays missing", (t) => {
  const { render, ok } = workspace(t);
  const document = heatmapDocument();
  document.datasets.observations = [
    { day: "Mon", station: "North", reading: 0 },
    { day: "Tue", station: "South", reading: 4 },
  ];
  document.body[1].source.aggregate = "sum";
  render(document);
  assert.deepEqual(inspectView(ok).body[1].values, [
    [0, null],
    [null, 4],
  ]);
});

test("heatmap axes retain scalar types and count source rows without a measure", (t) => {
  const { render, ok } = workspace(t);
  const x = [1, "1", null],
    y = [true, "true"];
  render({
    ...minimal(),
    datasets: {
      readings: [
        { x: x[0], y: y[0] },
        { x: x[0], y: y[0] },
        { x: x[1], y: y[0] },
        { x: x[2], y: y[1] },
      ],
    },
    body: [
      {
        type: "heatmap",
        source: { dataset: "readings", x: "x", y: "y", aggregate: "count" },
      },
    ],
  });
  const heatmap = inspectView(ok).body[0];
  assert.deepEqual(heatmap.x, x);
  assert.deepEqual(heatmap.y, y);
  assert.deepEqual(heatmap.values, [
    [2, 1, null],
    [null, null, 1],
  ]);
});

test("empty heatmap parameter exports retain axes and preserve saved evidence", (t) => {
  const { render, ok, root } = workspace(t);
  const entry = render(heatmapDocument());
  const files = [entry.document, entry.png, entry.pdf],
    before = files.map(digest);
  const empty = inspectView(ok, { station: "Absent" }).body[1];
  assert.ok(empty.values.flat().every((value) => value === null));
  const output = join(root, "empty.pdf");
  ok([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--format",
    "pdf",
    "--out",
    output,
    "--params",
    JSON.stringify({ station: "Absent" }),
  ]);
  const text = pdfTextPages(output).join(" ");
  for (const label of [...empty.x, ...empty.y, "Missing"])
    assert.ok(text.includes(label));
  assert.deepEqual(files.map(digest), before);
  assert.equal(ok(["list"]).versions.length, 1);
});

test("heatmap column bands keep labels and values readable in a narrow PDF", (t) => {
  const { ok } = workspace(t);
  const x = ["Morning", "Midday", "Afternoon", "Evening", "Night", "Dawn"],
    y = ["North", "South"];
  const values = [
    [11, 22, null, 44, 45, 46],
    [55, 66, 77, 88, 89, 90],
  ];
  const entry = ok(
    [
      "render",
      "--project",
      "orbital",
      "--artifact",
      "review",
      "--file",
      "-",
      "--width",
      "480",
    ],
    {
      ...minimal(),
      theme: "dark",
      body: [{ type: "heatmap", x, y, values, suffix: "%" }],
    },
  );
  const text = pdfTextPages(entry.pdf).join(" ");
  for (const label of [
    ...x,
    ...y,
    "Missing",
    ...values
      .flat()
      .filter((value) => value !== null)
      .map((value) => `${value}%`),
  ])
    assert.ok(text.includes(label), label);
});

test("trailing canvas padding does not create a contentless PDF page", (t) => {
  const { ok } = workspace(t);
  const x = ["Morning", "Midday", "Afternoon", "Evening"],
    y = ["North", "South"];
  const values = [
    [11, 22, null, 44],
    [55, 66, 77, 88],
  ];
  const entry = ok(
    [
      "render",
      "--project",
      "orbital",
      "--artifact",
      "review",
      "--file",
      "-",
      "--width",
      "480",
    ],
    {
      ...minimal(),
      title: "Fictional heatmap study: narrow",
      body: [{ type: "heatmap", x, y, values, suffix: "%" }],
    },
  );
  for (const page of pdfTextPages(entry.pdf))
    assert.ok(
      [...x, ...y].some((label) => page.includes(label)),
      "A PDF page contains only canvas padding",
    );
});

test("paginated heatmaps repeat headings while retaining every row", (t) => {
  const { render } = workspace(t);
  const x = ["Morning", "Midday", "Evening"];
  const y = Array.from(
    { length: 48 },
    (_, i) => `SITE_${String(i).padStart(3, "0")}`,
  );
  const entry = render({
    ...minimal(),
    body: [
      { type: "heatmap", x, y, values: y.map((_, i) => [i, i + 1, i + 2]) },
    ],
  });
  const pages = pdfTextPages(entry.pdf);
  assertTableContinuation(pages, x[0], y);
  for (const page of pages.filter((page) =>
    y.some((label) => page.includes(label)),
  ))
    for (const label of x) assert.ok(page.includes(label));
});

test("invalid heatmap matrices fail before publishing", (t) => {
  const { run, ok } = workspace(t);
  for (const matrix of [
    { x: ["Mon", "Tue"], y: ["North"], values: [[1]] },
    { x: ["Mon"], y: ["North"], values: [["1"]] },
    { x: [1, 1], y: ["North"], values: [[1, 2]] },
    { x: ["Mon"], y: ["North"], values: [[1]], min: 0 },
  ]) {
    const result = run(
      ["render", "--project", "orbital", "--artifact", "review", "--file", "-"],
      { ...minimal(), body: [{ type: "heatmap", ...matrix }] },
    );
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stderr).error, /body\[0\]/);
  }
  assert.deepEqual(ok(["list"]).versions, []);
});

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
    assert.deepEqual(view.chartSelections["body.stations"].values, values);
    assert.deepEqual(view.body[0].series, all.body[0].series);
    assert.equal(view.datasetRows.observations, 1);
    assert.equal(view.body[2].value, index + 1);
  }
  assert.deepEqual(
    inspectView(ok, { station: { all: true } }).chartSelections,
    all.chartSelections,
  );
});

test("a driving chart ignores only its own control while linked evidence uses every filter", (t) => {
  const { render, ok } = workspace(t);
  const source = { dataset: "readings", x: "station", y: "accepted" };
  render({
    ...minimal(),
    datasets: {
      readings: [
        { station: "North", shift: "Day", accepted: 4 },
        { station: "South", shift: "Day", accepted: 8 },
        { station: "North", shift: "Night", accepted: 3 },
        { station: "South", shift: "Night", accepted: 9 },
      ],
    },
    body: [
      {
        type: "control",
        id: "station",
        kind: "select",
        label: "Station",
        dataset: "readings",
        field: "station",
      },
      {
        type: "control",
        id: "peer",
        kind: "select",
        label: "Comparison station",
        dataset: "readings",
        field: "station",
      },
      {
        type: "control",
        id: "shift",
        kind: "select",
        label: "Shift",
        dataset: "readings",
        field: "shift",
      },
      { type: "chart", id: "driving", kind: "bar", select: "station", source },
      { type: "chart", id: "evidence", kind: "bar", source },
      {
        type: "metric",
        label: "Accepted",
        source: { dataset: "readings", field: "accepted", aggregate: "sum" },
      },
      {
        type: "table",
        dataset: "readings",
        columns: [{ key: "station", label: "Station" }],
      },
    ],
  });
  const selected = inspectView(ok, { station: "North", shift: "Night" });
  assert.deepEqual(selected.body[3].labels, ["North", "South"]);
  assert.deepEqual(selected.body[3].series[0].values, [3, 9]);
  assert.deepEqual(selected.body[4].labels, ["North"]);
  assert.deepEqual(selected.body[4].series[0].values, [3]);
  assert.equal(selected.body[5].value, 3);
  assert.equal(selected.body[6].rows.length, 1);
  const conflicting = inspectView(ok, {
    station: "North",
    peer: "South",
    shift: "Night",
  });
  assert.deepEqual(conflicting.chartSelections["body.driving"].values, [
    "South",
  ]);
  assert.deepEqual(conflicting.body[3].series[0].values, [9]);
  assert.deepEqual(conflicting.body[4].series, []);
  assert.equal(conflicting.body[5].value, 0);
  assert.deepEqual(conflicting.body[6].rows, []);
});

test("an absent chart selection retains comparison context and exports its empty evidence", (t) => {
  const { root, render, ok } = workspace(t);
  render({
    ...minimal(),
    datasets: {
      readings: [
        { station: "North", accepted: 4 },
        { station: "South", accepted: 8 },
      ],
    },
    body: [
      {
        type: "control",
        id: "station",
        kind: "select",
        label: "Station",
        dataset: "readings",
        field: "station",
      },
      {
        type: "chart",
        id: "driving",
        kind: "bar",
        select: "station",
        source: { dataset: "readings", x: "station", y: "accepted" },
      },
      {
        type: "metric",
        label: "Accepted",
        source: { dataset: "readings", field: "accepted", aggregate: "sum" },
      },
    ],
  });
  const view = inspectView(ok, { station: "West" });
  assert.deepEqual(view.chartSelections["body.driving"].values, [
    "North",
    "South",
  ]);
  assert.equal(view.datasetRows.readings, 0);
  assert.equal(view.body[2].value, 0);
  const output = join(root, "empty-selection.pdf");
  ok([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "review",
    "--params",
    '{"station":"West"}',
    "--format",
    "pdf",
    "--out",
    output,
  ]);
  assert.ok(pdfTextPages(output).join(" ").includes("West"));
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

test("linked area charts preserve signed values and export selected evidence", (t) => {
  const { root, render, ok } = workspace(t);
  const observations = [
    { station: "North", day: 0, delta: 12 },
    { station: "North", day: 1, delta: -4 },
    { station: "North", day: 2, delta: 0 },
    { station: "West", day: 0, delta: 8 },
  ];
  const document = {
    ...minimal(),
    datasets: { observations },
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
        type: "chart",
        kind: "area",
        source: {
          dataset: "observations",
          x: "day",
          y: "delta",
          series: "station",
        },
      },
    ],
  };
  const entry = render(document),
    before = digest(entry.document);
  const view = inspectView(ok, { station: "North" });
  assert.equal(view.body[1].kind, "area");
  assert.deepEqual(view.body[1].series, [
    { name: "North", x: [0, 1, 2], values: [12, -4, 0] },
  ]);
  const out = join(root, "selected.png");
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
  assert.ok(existsSync(out));
  assert.notEqual(digest(out), digest(entry.png));
  assert.equal(digest(entry.document), before);
  assert.equal(ok(["list"]).versions.length, 1);
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
