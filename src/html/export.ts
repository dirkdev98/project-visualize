import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHighlighterCoreSync } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import { Marked } from "marked";
import type { Parameters } from "../data.ts";
import type { Artifact, Block, ControlBlock } from "../model.ts";
import { languages } from "../ui/languages.ts";
import { escapeHtml } from "./markup.ts";
import {
  type HtmlPayload,
  htmlState,
  renderDocument,
  themeStyle,
} from "./render.ts";

function highlights(document: Artifact): {
  values: Record<string, string>;
  fonts: Set<string>;
} {
  const codes: { content: string; language: string }[] = [];
  const fonts = new Set(["regular", "bold"]);
  const parser = new Marked({
    walkTokens(token) {
      if (token.type === "code" || token.type === "codespan") fonts.add("mono");
      if (token.type === "em") fonts.add("italic");
      if (token.type === "code")
        codes.push({
          content: token.text,
          language: token.lang?.split(/\s/)[0] ?? "",
        });
    },
  });
  function visit(block: Block) {
    if ("children" in block) block.children.forEach(visit);
    if (block.type === "code") {
      fonts.add("mono");
      codes.push({ content: block.content, language: block.language ?? "" });
    }
    if (block.type === "heatmap") fonts.add("mono");
    if (
      block.type === "diagram" &&
      "nodes" in block &&
      block.nodes.some((node) => node.fields?.length)
    )
      fonts.add("mono");
    if (block.type === "markdown" || block.type === "callout")
      parser.parse(block.content);
    if (block.type === "timeline")
      for (const event of block.events)
        if (event.content) parser.parse(event.content);
  }
  document.body.forEach(visit);
  const result: Record<string, string> = {};
  if (!codes.length) return { values: result, fonts };
  const highlighter = createHighlighterCoreSync({
    engine: createJavaScriptRegexEngine(),
    langs: [],
    themes: [],
  });
  const syntax = mal.assets.materialize("syntax"),
    theme = `github-${document.theme ?? "light"}`;
  try {
    highlighter.loadThemeSync(
      JSON.parse(readFileSync(join(syntax, `${theme}.json`), "utf8")),
    );
    function load(language: string) {
      if (highlighter.getLoadedLanguages().includes(language)) return;
      for (const dependency of languages[language].dependencies)
        load(dependency);
      highlighter.loadLanguageSync(
        JSON.parse(readFileSync(join(syntax, `${language}.json`), "utf8")),
      );
    }
    for (const code of codes) {
      const requested = code.language.toLowerCase(),
        language = Object.hasOwn(languages, requested)
          ? requested
          : Object.keys(languages).find((key) =>
              languages[key].aliases.includes(requested),
            );
      if (!language) continue;
      load(language);
      const highlighted = highlighter.codeToTokens(code.content, {
        lang: language,
        theme,
      });
      result[`${code.language}\n${code.content}`] = highlighted.tokens
        .map((line) =>
          line
            .map(
              (token) =>
                `<span style="color:${escapeHtml(token.color ?? highlighted.fg ?? "inherit")}${token.fontStyle && token.fontStyle & 1 ? ";font-style:italic" : ""}${token.fontStyle && token.fontStyle & 2 ? ";font-weight:600" : ""}${token.fontStyle && token.fontStyle & 4 ? ";text-decoration:underline" : ""}">${escapeHtml(token.content)}</span>`,
            )
            .join(""),
        )
        .join("\n");
    }
    return { values: result, fonts };
  } finally {
    highlighter.dispose();
  }
}

export function exportHtml(
  document: Artifact,
  parameters: Parameters,
  output: string,
  width: number,
  options: {
    partial: boolean;
    mode: HtmlPayload["mode"];
    provenance: HtmlPayload["provenance"];
    supportControls: ControlBlock[];
  },
): number {
  const copy: Artifact = JSON.parse(JSON.stringify(document));
  for (const [name, file] of Object.entries(copy.assets ?? {})) {
    const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
    if (copy.assets)
      copy.assets[name] =
        `data:${mime};base64,${readFileSync(file).toString("base64")}`;
  }
  const syntax = highlights(copy);
  const payload: HtmlPayload = {
    document: copy,
    parameters: Object.fromEntries(parameters),
    partial: options.partial,
    mode: options.mode,
    provenance: options.provenance,
    highlights: syntax.values,
    supportControls: options.supportControls,
  };
  const resources = mal.assets.materialize("html");
  let style = readFileSync(join(resources, "style.css"), "utf8");
  const fontScales: Record<string, number> = JSON.parse(
    readFileSync(join(resources, "font-scales.json"), "utf8"),
  );
  // ImGui's pixel size spans ascent to descent; CSS sizes use units per em.
  for (const [file, family, weight, fontStyle] of [
    ["regular", "PVSans", 400, "normal"],
    ["bold", "PVSans", 600, "normal"],
    ["italic", "PVSans", 400, "italic"],
    ["mono", "PVMono", 400, "normal"],
  ] as const) {
    if (!syntax.fonts.has(file)) continue;
    style += `\n@font-face{font-family:${family};font-weight:${weight};font-style:${fontStyle};font-display:block;size-adjust:${fontScales[file] * 100}%;src:url(data:font/woff2;base64,${readFileSync(join(resources, `${file}.woff2`)).toString("base64")}) format('woff2')}`;
  }
  const theme = copy.theme ?? "light";
  const vars = themeStyle(theme);
  const horizontal =
    width < 480 ? (options.partial ? 24 : 16) : options.partial ? 48 : 36;
  const vertical = options.partial ? 40 : 32;
  const padding =
    options.mode === "standalone" ? `${vertical}px ${horizontal}px` : "0";
  const content = renderDocument(payload, htmlState(payload), width);
  const json = JSON.stringify(payload).replace(
    /[<>&\u2028\u2029]/g,
    (value) => `\\u${value.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const client = readFileSync(join(resources, "client.js"), "utf8").replace(
    /<\/script/gi,
    "<\\/script",
  );
  const body = `<style>${style}</style><main id="visualize" class="pv" style="${vars};max-width:${width}px;margin:0 auto;padding:${padding};${options.mode === "standalone" ? "background:var(--pv-paper)" : ""}">${content}</main><script type="application/json" id="visualize-document">${json}</script><script>${client}</script>`;
  const license = readFileSync(
    join(resources, "LICENSES.txt"),
    "utf8",
  ).replaceAll("--", "- -");
  const html =
    options.mode === "fragment"
      ? `${body}<!-- ${license} -->`
      : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';img-src data: blob:;font-src data:;connect-src 'none';object-src 'none';base-uri 'none';form-action 'none'"><title>${escapeHtml(copy.title)}</title><style>html,body{margin:0;${options.mode === "standalone" ? `background:${theme === "dark" ? "#18181b" : "#f7f7f9"};` : ""}color-scheme:${theme}}</style></head><body>${body}<!-- ${license} --></body></html>`;
  writeFileSync(output, html);
  return Buffer.byteLength(html);
}
