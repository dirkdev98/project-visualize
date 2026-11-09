import { decodeHTMLStrict } from "entities";
import { lexer, type MarkedToken, type Token } from "marked";
import type { Artifact, Block } from "./model.ts";

export interface OutlineHeading {
  id: string;
  title: string;
  depth: number;
  parent?: string;
  breadcrumb: string;
}

export function headingText(tokens: Token[]): string {
  return tokens
    .map((raw) => {
      const token = raw as MarkedToken;
      if (
        token.type === "codespan" ||
        token.type === "html" ||
        token.type === "image"
      )
        return token.text;
      if ("tokens" in token && token.tokens) return headingText(token.tokens);
      if (token.type === "br") return " ";
      return decodeHTMLStrict("text" in token ? token.text : token.raw);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export class DocumentOutline {
  readonly headings: OutlineHeading[] = [];
  private ids = new Map<string, OutlineHeading>();
  private blocks = new Map<string, OutlineHeading>();
  private tokens = new Map<string, WeakMap<Token, OutlineHeading>>();
  private details = new Map<string, string[]>();
  private query = "";
  private matches: OutlineHeading[] = [];

  constructor(
    document: Artifact,
    tokenize: (source: string) => Token[] = (source) =>
      lexer(source, { gfm: true }),
  ) {
    const add = (
      id: string,
      title: string,
      parent: OutlineHeading | undefined,
      details: string[],
    ) => {
      title = title.replace(/\s+/g, " ").trim();
      if (!title) return parent;
      const entry = {
        id,
        title,
        depth: parent ? parent.depth + 1 : 0,
        parent: parent?.id,
        breadcrumb: parent?.parent
          ? [parent.breadcrumb, parent.title].filter(Boolean).join(" › ")
          : "",
      };
      this.headings.push(entry);
      this.ids.set(id, entry);
      this.details.set(id, details);
      return entry;
    };
    const root = add("document", document.title, undefined, []);
    if (root) this.blocks.set("document", root);
    const markdown = (
      source: string,
      key: string,
      parent: OutlineHeading | undefined,
      details: string[],
    ) => {
      const indexed = new WeakMap<Token, OutlineHeading>();
      this.tokens.set(key, indexed);
      const names = new Map<string, number>();
      const visit = (tokens: Token[], parent: OutlineHeading | undefined) => {
        const stack: { level: number; heading: OutlineHeading }[] = [];
        for (const raw of tokens) {
          const token = raw as MarkedToken;
          const owner = () => stack[stack.length - 1]?.heading ?? parent;
          if (token.type === "heading") {
            while (stack.length && stack[stack.length - 1].level >= token.depth)
              stack.pop();
            const title = headingText(token.tokens);
            const slug =
              title
                .toLowerCase()
                .replace(/[^\p{L}\p{N}_-]+/gu, "-")
                .replace(/^-|-$/g, "") || "section";
            const count = names.get(slug) ?? 0;
            names.set(slug, count + 1);
            const heading = add(
              `heading:${key}:${slug}:${count}`,
              title,
              owner(),
              details,
            );
            if (heading) {
              indexed.set(raw, heading);
              stack.push({ level: token.depth, heading });
            }
          } else if (token.type === "blockquote") visit(token.tokens, owner());
          else if (token.type === "list")
            for (const item of token.items) visit(item.tokens, owner());
        }
      };
      visit(tokenize(source), parent);
    };
    const visit = (
      children: Block[],
      prefix: string,
      parent: OutlineHeading | undefined,
      details: string[],
    ) => {
      children.forEach((block, index) => {
        const key = `${prefix}.${block.id ?? index}`;
        const ancestors =
          block.type === "details" ? [...details, key] : details;
        let owner = parent;
        const title =
          block.title ?? (block.type === "details" ? "Details" : undefined);
        if (title) {
          owner = add(`block:${key}`, title, parent, ancestors);
          if (owner) this.blocks.set(key, owner);
        }
        if (block.type === "markdown" || block.type === "callout")
          markdown(block.content, key, owner, ancestors);
        if ("children" in block) visit(block.children, key, owner, ancestors);
        if (block.type === "timeline")
          block.events.forEach((event, index) => {
            const eventKey = `${key}.events.${index}`;
            const heading = add(
              `event:${eventKey}`,
              event.title,
              owner,
              ancestors,
            );
            if (heading) this.blocks.set(eventKey, heading);
            if (event.content)
              markdown(event.content, eventKey, heading, ancestors);
          });
      });
    };
    visit(document.body, "body", root, []);
  }

  find(id: string) {
    return this.ids.get(id);
  }
  search(query: string): OutlineHeading[] {
    query = query.trim().toLowerCase();
    if (!query) return this.headings;
    if (query !== this.query) {
      this.query = query;
      this.matches = this.headings.filter((heading) =>
        `${heading.title} ${heading.breadcrumb}`.toLowerCase().includes(query),
      );
    }
    return this.matches;
  }
  block(key: string) {
    return this.blocks.get(key);
  }
  token(key: string, token: Token) {
    return this.tokens.get(key)?.get(token);
  }
  reveal(id: string) {
    return this.details.get(id) ?? [];
  }
}
