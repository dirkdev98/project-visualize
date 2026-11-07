import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dark from "@shikijs/themes/github-dark";
import light from "@shikijs/themes/github-light";
import { languages } from "../src/ui/languages.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fonts = join(root, "assets/fonts");
const manifest = JSON.parse(readFileSync(join(fonts, "sources.json"), "utf8"));
for (const [name, source] of Object.entries(manifest.files)) {
  const hash = createHash("sha256")
    .update(readFileSync(join(fonts, name)))
    .digest("hex");
  if (hash !== source.sha256)
    throw new Error(`Font checksum mismatch: ${name}`);
}
const output = join(root, ".cache/resources/syntax");
if (existsSync(output)) rmSync(output, { recursive: true });
mkdirSync(output, { recursive: true });
for (const language of Object.keys(languages)) {
  const grammar = await import(`@shikijs/langs/${language}`);
  writeFileSync(
    join(output, `${language}.json`),
    JSON.stringify(grammar.default),
  );
}
writeFileSync(join(output, "github-light.json"), JSON.stringify(light));
writeFileSync(join(output, "github-dark.json"), JSON.stringify(dark));
