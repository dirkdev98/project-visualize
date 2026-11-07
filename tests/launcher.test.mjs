import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("a CLI linked onto PATH resolves its checkout and keeps caller-relative inputs", (t) => {
  const root = mkdtempSync(join(tmpdir(), "visualize launcher "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const links = join(root, "launcher links"),
    aliases = join(root, "aliases"),
    caller = join(root, "another project");
  for (const directory of [links, aliases, caller]) mkdirSync(directory);
  symlinkSync(resolve("bin/visualize"), join(aliases, "application"));
  symlinkSync("../aliases/application", join(links, "visualize"));
  writeFileSync(
    join(caller, "evidence notes.json"),
    JSON.stringify({
      schemaVersion: 1,
      type: "document",
      title: "Fictional linked evidence",
      body: [{ type: "text", content: "Relative to the caller." }],
    }),
  );
  const result = execFileSync(
    "visualize",
    ["validate", "--file", "evidence notes.json"],
    {
      cwd: caller,
      env: { ...process.env, PATH: `${links}:${process.env.PATH}` },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  assert.deepEqual(JSON.parse(result), {
    valid: true,
    title: "Fictional linked evidence",
  });
});
