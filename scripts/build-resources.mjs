import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import dark from "@shikijs/themes/github-dark";
import light from "@shikijs/themes/github-light";
import { build } from "esbuild";
import wawoff2 from "wawoff2";
import { languages } from "../src/ui/languages.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const directory of ["assets/fonts", "assets/icons"]) {
  const fonts = join(root, directory);
  const manifest = JSON.parse(
    readFileSync(join(fonts, "sources.json"), "utf8"),
  );
  for (const [name, source] of Object.entries(manifest.files)) {
    const hash = createHash("sha256")
      .update(readFileSync(join(fonts, name)))
      .digest("hex");
    if (hash !== source.sha256)
      throw new Error(`Font checksum mismatch: ${directory}/${name}`);
  }
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

const workflow = join(root, ".cache/resources/workflow");
rmSync(workflow, { recursive: true, force: true });
mkdirSync(join(workflow, "docs"), { recursive: true });
copyFileSync(
  join(root, "skills/project-visualize/SKILL.md"),
  join(workflow, "SKILL.md"),
);
copyFileSync(
  join(root, "docs/artifacts.md"),
  join(workflow, "docs/artifacts.md"),
);
cpSync(join(root, "examples"), join(workflow, "examples"), { recursive: true });

const html = join(root, ".cache/resources/html");
mkdirSync(html, { recursive: true });
await build({
  entryPoints: [join(root, "src/html/client.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  outfile: join(html, "client.js"),
  legalComments: "inline",
});
copyFileSync(join(root, "src/html/style.css"), join(html, "style.css"));
copyFileSync(
  join(root, "assets/fonts/LICENSE.txt"),
  join(html, "FONT-LICENSE.txt"),
);
writeFileSync(
  join(html, "LICENSES.txt"),
  `${readFileSync(join(root, "assets/fonts/LICENSE.txt"), "utf8")}\n${readFileSync(join(root, "node_modules/marked/LICENSE"), "utf8")}`,
);
const fontScales = {};
for (const [name, file] of Object.entries({
  regular: "IBMPlexSans-Regular.ttf",
  bold: "IBMPlexSans-SemiBold.ttf",
  italic: "IBMPlexSans-Italic.ttf",
  mono: "IBMPlexMono-Regular.ttf",
})) {
  const source = readFileSync(join(root, "assets/fonts", file));
  const font = fontkit.create(source);
  fontScales[name] = font.unitsPerEm / (font.ascent - font.descent);
  const digest = createHash("sha256").update(source).digest("hex");
  const marker = join(html, `${name}.sha256`),
    destination = join(html, `${name}.woff2`);
  if (
    !existsSync(destination) ||
    !existsSync(marker) ||
    readFileSync(marker, "utf8") !== digest
  ) {
    writeFileSync(destination, await wawoff2.compress(source));
    writeFileSync(marker, digest);
  }
}
writeFileSync(join(html, "font-scales.json"), JSON.stringify(fontScales));
