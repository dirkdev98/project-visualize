import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const appearances = [
  { theme: "light", width: 1280 },
  { theme: "dark", width: 1280 },
  { theme: "light", width: 390 },
  { theme: "dark", width: 390 },
];

export function catalogue() {
  return readdirSync(join(root, "examples/widgets"))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((file) => {
      const source = join(root, "examples/widgets", file);
      return {
        name: file.slice(0, -5),
        source,
        document: JSON.parse(readFileSync(source, "utf8")),
      };
    });
}

export function exportIndex(examples) {
  return `${[
    "# Widget exports",
    "",
    "Generated from the [widget sources](../../widgets). HTML runs offline and keeps",
    "controls interactive. PNG and PDF capture the initial view at 1x density.",
    "",
    "| Example | Appearance | HTML | Browser preview | Native PNG | PDF |",
    "| --- | --- | --- | --- | --- | --- |",
    ...examples.flatMap(({ name, document }) =>
      appearances.map(({ theme, width }) => {
        const stem = `${name}/${theme}-${width}`;
        return `| [${document.title}](../../widgets/${name}.json) | ${theme}, ${width} | [Open](${stem}.html) | [View](${stem}.browser.png) | [View](${stem}.png) | [Open](${stem}.pdf) |`;
      }),
    ),
    "",
  ].join("\n")}\n`;
}
