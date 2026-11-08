import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const paths = ["examples/exports/linux", "tests/visual/snapshots/linux"];
const changed = execFileSync(
  "git",
  ["status", "--porcelain", "-uall", "--", ...paths],
  { encoding: "utf8" },
).trim();
const changes = JSON.parse(
  readFileSync(".cache/example-results/changes.json", "utf8"),
);
const groups = new Map();
for (const change of changes) {
  if (change.file === "index.md") continue;
  const name = change.file.split("/")[0];
  const group = groups.get(name) ?? {
    added: 0,
    changed: 0,
    removed: 0,
    pixels: undefined,
  };
  group[change.status]++;
  if (change.file.endsWith(".png") && change.detail.includes("% pixels"))
    group.pixels = Math.max(
      group.pixels ?? 0,
      Number.parseFloat(change.detail),
    );
  groups.set(name, group);
}
const run = process.env.GITHUB_RUN_ID;
const repository = process.env.GITHUB_REPOSITORY;
const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
const body = [
  "Regenerate widget exports and visual references from the structured examples.",
  "",
  "| Example | Added | Changed | Removed | Largest image change |",
  "| --- | ---: | ---: | ---: | ---: |",
  ...[...groups].map(
    ([name, value]) =>
      `| ${name} | ${value.added} | ${value.changed} | ${value.removed} | ${value.pixels === undefined ? "n/a" : `${value.pixels.toFixed(2)}%`} |`,
  ),
  "",
  "The report includes before/after exports, PNG differences and PDF page counts.",
  "Visual reference changes are included in the same proposal. Review the rendering report before accepting them.",
  "",
  ...(run && repository
    ? [
        `[Download rendering reports](${server}/${repository}/actions/runs/${run}).`,
        "",
      ]
    : []),
].join("\n");
writeFileSync(".cache/example-results/pull-request.md", body);
if (changed) {
  const date = new Date().toISOString().slice(0, 10);
  const ledger = "docs/decisions.md";
  const entry = `## ${date} generated rendering references\n\n- Regenerate widget exports and visual references from the structured examples.\n  Keep the generated changes in a separate review so appearance changes remain visible.\n\n`;
  writeFileSync(
    ledger,
    readFileSync(ledger, "utf8").replace(
      "# Decisions\n\n",
      `# Decisions\n\n${entry}`,
    ),
  );
}
