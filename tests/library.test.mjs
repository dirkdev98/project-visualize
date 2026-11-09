import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveNeighbor, libraryGroups } from "../src/library.ts";

const revision = (project, artifact, createdAt, extra = {}) => ({
  project,
  artifact,
  version: `${createdAt}-${artifact}`,
  title: artifact,
  createdAt,
  ...extra,
});

test("projects and artifacts order by their latest revision or presentation", () => {
  const groups = libraryGroups([
    revision("orbital", "review", "2026-01-03T10:00:00.000Z"),
    revision("orbital", "notes", "2026-01-01T10:00:00.000Z", {
      presentedAt: "2026-01-04T10:00:00.000Z",
      currentPresentation: true,
    }),
    revision("field", "plan", "2026-01-02T10:00:00.000Z"),
  ]);
  assert.deepEqual(
    groups.map(({ project, artifacts }) => [
      project,
      artifacts.map(({ artifact }) => artifact),
    ]),
    [
      ["orbital", ["notes", "review"]],
      ["field", ["plan"]],
    ],
  );
});

test("an artifact shows its presented revision, otherwise its latest", () => {
  const [{ artifacts }] = libraryGroups([
    revision("orbital", "review", "2026-01-01T10:00:00.000Z"),
    revision("orbital", "review", "2026-01-03T10:00:00.000Z"),
    revision("orbital", "notes", "2026-01-01T10:00:00.000Z", {
      presentedAt: "2026-01-02T10:00:00.000Z",
      currentPresentation: true,
    }),
    revision("orbital", "notes", "2026-01-05T10:00:00.000Z"),
  ]);
  const shown = Object.fromEntries(
    artifacts.map(({ artifact, entry }) => [artifact, entry.createdAt]),
  );
  assert.deepEqual(shown, {
    review: "2026-01-03T10:00:00.000Z",
    notes: "2026-01-01T10:00:00.000Z",
  });
});

for (const [artifact, expected] of [
  ["newest", "middle"],
  ["middle", "newest"],
  ["oldest", "middle"],
]) {
  test(`archiving ${artifact} opens the preceding active artifact or the next one in its project`, () => {
    const entries = [
      revision("field", "other-project", "2026-01-05T10:00:00.000Z"),
      revision("orbital", "newest", "2026-01-04T10:00:00.000Z"),
      revision("orbital", "archived", "2026-01-03T10:00:00.000Z", {
        archivedAt: "2026-01-06T10:00:00.000Z",
      }),
      revision("orbital", "middle", "2026-01-02T10:00:00.000Z"),
      revision("orbital", "oldest", "2026-01-01T10:00:00.000Z"),
    ].map((entry) =>
      entry.artifact === artifact
        ? { ...entry, archivedAt: "2026-01-06T10:00:00.000Z" }
        : entry,
    );
    assert.equal(
      archiveNeighbor(entries, { project: "orbital", artifact })?.artifact,
      expected,
    );
  });
}

test("archiving the only active artifact leaves the project without a selection", () => {
  assert.equal(
    archiveNeighbor(
      [
        revision("field", "other-project", "2026-01-05T10:00:00.000Z"),
        revision("orbital", "review", "2026-01-04T10:00:00.000Z", {
          archivedAt: "2026-01-06T10:00:00.000Z",
        }),
        revision("orbital", "older", "2026-01-03T10:00:00.000Z", {
          archivedAt: "2026-01-06T10:00:00.000Z",
        }),
      ],
      { project: "orbital", artifact: "review" },
    ),
    undefined,
  );
});
