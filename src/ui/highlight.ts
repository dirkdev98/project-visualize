import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHighlighterCoreSync } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import { languages } from "./languages.ts";
import { type Color, color, palette } from "./theme.ts";

export interface CodeRun {
  content: string;
  color: Color;
  fontStyle: number;
}
export type CodeLines = CodeRun[][];
export class SyntaxHighlighter {
  private highlighter: ReturnType<typeof createHighlighterCoreSync> | undefined;
  private resources = "";
  private loadLanguage(language: string) {
    const highlighter = this.highlighter;
    if (!highlighter || highlighter.getLoadedLanguages().includes(language))
      return;
    for (const dependency of languages[language].dependencies)
      this.loadLanguage(dependency);
    highlighter.loadLanguageSync(
      JSON.parse(
        readFileSync(join(this.resources, `${language}.json`), "utf8"),
      ),
    );
  }
  highlight(source: string, language: string): CodeLines {
    const requested = language.toLowerCase();
    const lang = Object.hasOwn(languages, requested)
      ? requested
      : Object.keys(languages).find((name) =>
          languages[name].aliases.includes(requested),
        );
    if (!lang)
      return source
        .split("\n")
        .map((content) => [{ content, color: palette.ink, fontStyle: 0 }]);
    if (!this.highlighter) {
      this.resources = mal.assets.materialize("syntax");
      this.highlighter = createHighlighterCoreSync({
        engine: createJavaScriptRegexEngine(),
        langs: [],
        themes: [
          JSON.parse(readFileSync(join(this.resources, "theme.json"), "utf8")),
        ],
      });
    }
    this.loadLanguage(lang);
    const result = this.highlighter.codeToTokens(source, {
      lang,
      theme: "github-light",
    });
    return result.tokens.map((line) =>
      line.map((token) => ({
        content: token.content,
        color: color(token.color ?? result.fg ?? "#172033"),
        fontStyle: token.fontStyle ?? 0,
      })),
    );
  }
  dispose() {
    this.highlighter?.dispose();
    this.highlighter = undefined;
  }
}
