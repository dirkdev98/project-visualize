import assert from "node:assert/strict";
import { test } from "node:test";
import { lexer } from "marked";
import { DocumentOutline } from "../src/outline.ts";

const report = (body) => ({
  schemaVersion: 1,
  type: "document",
  title: "Station review",
  body,
});

test("identical headings remain separately addressable in separate report blocks", () => {
  const outline = new DocumentOutline(
    report([
      {
        type: "markdown",
        id: "north",
        title: "North",
        content: "## Evidence\n\n### Details",
      },
      {
        type: "markdown",
        id: "south",
        title: "South",
        content: "## Evidence\n\n### Details",
      },
    ]),
  );
  const headings = outline.headings.filter((h) => h.title === "Evidence");
  assert.equal(new Set(headings.map((h) => h.id)).size, headings.length);
  assert.deepEqual(
    headings.map((h) => outline.find(h.parent)?.title),
    ["North", "South"],
  );
  assert.deepEqual(
    outline
      .search("evidence")
      .filter((h) => h.title === "Evidence")
      .map((h) => h.breadcrumb),
    ["North", "South"],
  );
});

test("inserting prose and reflowing a report keeps section identities", () => {
  const body = (content) => [{ type: "markdown", id: "review", content }];
  const before = new DocumentOutline(
    report(body("## Evidence\n\n### Checks\n\n## Evidence")),
  );
  const after = new DocumentOutline(
    report(
      body(
        "Opening paragraph.\n\n## Evidence\n\nMore observations.\n\n### Checks\n\n## Evidence",
      ),
    ),
  );
  assert.deepEqual(after.headings, before.headings);
});

test("a target reveals every collapsed ancestor, including untitled details", () => {
  const outline = new DocumentOutline(
    report([
      {
        type: "details",
        id: "outer",
        children: [
          {
            type: "details",
            id: "inner",
            title: "Evidence",
            children: [
              { type: "markdown", id: "checks", content: "## Calibration" },
            ],
          },
        ],
      },
    ]),
  );
  const target = outline.headings.find((h) => h.title === "Calibration");
  assert.deepEqual(outline.reveal(target.id), [
    "body.outer",
    "body.outer.inner",
  ]);
  const details = outline.headings.find((h) => h.title === "Details");
  assert.deepEqual(outline.reveal(details.id), ["body.outer"]);
});

test("quoted and listed headings keep their own hierarchy", () => {
  const outline = new DocumentOutline(
    report([
      {
        type: "markdown",
        content:
          "## Overview\n\n> ### Evidence\n>\n> #### Review\n\n- ### Checks\n\n## Conclusion",
      },
    ]),
  );
  const parent = (title) => {
    const heading = outline.headings.find((h) => h.title === title);
    return outline.find(heading.parent)?.title;
  };
  assert.equal(parent("Review"), "Evidence");
  assert.equal(parent("Checks"), "Overview");
  assert.equal(parent("Conclusion"), "Station review");
});

test("reused Markdown tokens resolve a heading within the correct block", () => {
  const tokens = lexer("## **Evidence** &amp; `checks`");
  const outline = new DocumentOutline(
    report([
      { type: "markdown", id: "north", content: "same" },
      { type: "markdown", id: "south", content: "same" },
    ]),
    () => tokens,
  );
  const a = outline.token("body.north", tokens[0]);
  const b = outline.token("body.south", tokens[0]);
  assert.notEqual(a.id, b.id);
  assert.equal(a.title, "Evidence & checks");
});
