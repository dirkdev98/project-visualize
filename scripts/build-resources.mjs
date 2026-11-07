import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import theme from "@shikijs/themes/github-light";
import { languages } from "../src/ui/languages.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".cache/resources/syntax");
mkdirSync(output, { recursive: true });
for (const language of Object.keys(languages)) {
  const grammar = await import(`@shikijs/langs/${language}`);
  writeFileSync(
    join(output, `${language}.json`),
    JSON.stringify(grammar.default),
  );
}
writeFileSync(join(output, "theme.json"), JSON.stringify(theme));
