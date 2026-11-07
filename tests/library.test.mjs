import assert from "node:assert/strict";
import { test } from "node:test";
import { libraryGroups } from "../src/library.ts";

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
