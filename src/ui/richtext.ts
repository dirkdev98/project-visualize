import {
  ImDrawList_AddLine,
  ImDrawList_AddRect,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
  ImGuiMouseCursor_Hand,
  ImGuiTableFlags_BordersInnerH,
  ImGuiTableFlags_RowBg,
  ImGuiTableRowFlags_Headers,
  igAlignTextToFramePadding,
  igBeginTable,
  igBeginTooltip,
  igButton,
  igCalcTextSize,
  igDummy,
  igEndTable,
  igEndTooltip,
  igGetCursorScreenPos,
  igGetItemRectMax,
  igGetItemRectMin,
  igGetWindowDrawList,
  igIndent,
  igInvisibleButton,
  igIsItemHovered,
  igPopFont,
  igPopID,
  igPushFont,
  igPushID_Int,
  igSameLine,
  igSeparator,
  igSetClipboardText,
  igSetCursorScreenPos,
  igSetMouseCursor,
  igSpacing,
  igTableNextColumn,
  igTableNextRow,
  igUnindent,
  pv_open_url,
} from "maligator:ffi/visualize";
import { decodeHTMLStrict } from "entities";
import { lexer, type MarkedToken, type Token } from "marked";
import { type CodeLines, SyntaxHighlighter } from "./highlight.ts";
import {
  captureHeading,
  captureTable,
  currentCapture,
  keepLineTogether,
  keepTogether,
} from "./layout.ts";
import { available, captureText, panel, text } from "./primitives.ts";
import {
  draggingText,
  selectionBreak,
  selectionText,
  withoutTextSelection,
} from "./selection.ts";
import {
  currentTheme,
  type Font,
  fonts,
  framePadding,
  packed,
  palette,
} from "./theme.ts";

interface Run {
  value: string;
  strong?: boolean;
  emphasis?: boolean;
  code?: boolean;
  strike?: boolean;
  link?: string;
  image?: string;
}
function runs(
  tokens: Token[],
  style: Omit<Run, "value"> = {},
  out: Run[] = [],
): Run[] {
  for (const raw of tokens) {
    const token = raw as MarkedToken;
    switch (token.type) {
      case "strong":
        runs(token.tokens, { ...style, strong: true }, out);
        break;
      case "em":
        runs(token.tokens, { ...style, emphasis: true }, out);
        break;
      case "del":
        runs(token.tokens, { ...style, strike: true }, out);
        break;
      case "link":
        runs(token.tokens, { ...style, link: token.href }, out);
        break;
      case "image":
        out.push({ ...style, value: token.text, image: token.href });
        break;
      case "codespan":
        out.push({ ...style, value: token.text, code: true });
        break;
      case "br":
        out.push({ ...style, value: "\n" });
        break;
      case "checkbox":
        out.push({ ...style, value: token.checked ? "[x] " : "[ ] " });
        break;
      case "text":
        if (token.tokens) runs(token.tokens, style, out);
        else
          out.push({
            ...style,
            value: decodeHTMLStrict(token.text).replace(/\n/g, " "),
          });
        break;
      case "escape":
        out.push({ ...style, value: token.text });
        break;
      case "html":
        out.push({ ...style, value: token.text });
        break;
      default:
        out.push({ ...style, value: token.raw });
    }
  }
  return out;
}

function fittingPrefix(value: string, width: number): string {
  const points = Array.from(value);
  let low = 1,
    high = points.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (igCalcTextSize(points.slice(0, mid).join(""), false, -1).x <= width)
      low = mid;
    else high = mid - 1;
  }
  return points.slice(0, low).join("");
}

export class RichText {
  private highlighter = new SyntaxHighlighter();
  private image: (asset: string, width: number) => number;
  private trees = new Map<string, Token[]>();
  private codeTokens = new Map<string, CodeLines>();
  private codeTheme = currentTheme();
  constructor(image: (asset: string, width: number) => number) {
    this.image = image;
  }
  dispose() {
    this.trees.clear();
    this.codeTokens.clear();
    this.highlighter.dispose();
  }
  markdown(source: string, exporting: boolean, parentHeading?: number) {
    let tokens = this.trees.get(source);
    if (!tokens) {
      tokens = lexer(source, { gfm: true });
      this.trees.set(source, tokens);
    }
    this.blocks(tokens, exporting, parentHeading);
  }
  private inline(tokens: Token[], size = 18, strong = false) {
    const origin = igGetCursorScreenPos();
    const width = Math.max(20, available());
    const line = size * 1.48;
    const draw = igGetWindowDrawList();
    if (!draw) throw new Error("Cannot access the text canvas");
    let x = 0,
      y = 0,
      id = 0;
    for (const run of runs(tokens, { strong })) {
      if (run.image) {
        if (x > 0) {
          y += line;
          x = 0;
        }
        igSetCursorScreenPos({ x: origin.x, y: origin.y + y });
        if (!run.image.startsWith("asset:"))
          throw new Error(
            `Markdown images must refer to a declared asset: ${run.image}`,
          );
        y += this.image(run.image.slice(6), width) + 12;
        continue;
      }
      const font: Font = run.code
        ? "mono"
        : run.strong
          ? "bold"
          : run.emphasis
            ? "italic"
            : "regular";
      const face = fonts[font];
      if (!face) throw new Error("Fonts are not initialized");
      const fontSize = run.code ? size * 0.92 : size;
      igPushFont(face, fontSize);
      const pieces = run.value.match(/\n|[^\S\n]+|[^\s]+/g) ?? [];
      for (let piece of pieces) {
        if (piece === "\n") {
          selectionBreak("\n");
          x = 0;
          y += line;
          continue;
        }
        const space = /^\s+$/.test(piece);
        if (space && x === 0) {
          selectionBreak(piece);
          continue;
        }
        let measured = igCalcTextSize(piece, false, -1).x;
        if (x + measured > width && x > 0) {
          x = 0;
          y += line;
          if (space) {
            selectionBreak(piece);
            continue;
          }
        }
        while (piece.length) {
          const part =
            measured > width ? fittingPrefix(piece, width - x) : piece;
          const partWidth = igCalcTextSize(part, false, -1).x;
          const point = {
            x: origin.x + x,
            y: origin.y + y + (line - size) * 0.35,
          };
          const tint = run.link ? palette.accent : palette.ink;
          keepLineTogether(point.y, point.y + fontSize + 3);
          if (run.code)
            ImDrawList_AddRectFilled(
              draw,
              { x: point.x - 2, y: point.y - 2 },
              { x: point.x + partWidth + 2, y: point.y + size + 2 },
              packed(palette.code),
              3,
              0,
            );
          ImDrawList_AddText_FontPtr(
            draw,
            face,
            fontSize,
            point,
            packed(tint),
            part,
            0,
          );
          captureText(part, font, fontSize, point, partWidth, run.link);
          selectionText(part, font, fontSize, point, partWidth);
          if (run.strike || run.link) {
            const offset = run.strike ? size * 0.55 : size + 1;
            ImDrawList_AddLine(
              draw,
              { x: point.x, y: point.y + offset },
              { x: point.x + partWidth, y: point.y + offset },
              packed(tint),
              1,
              0,
            );
          }
          if (run.link && !space) {
            igSetCursorScreenPos(point);
            igPushID_Int(id++);
            if (
              igInvisibleButton(
                "link",
                { x: Math.max(1, partWidth), y: size + 3 },
                0,
              ) &&
              !draggingText() &&
              /^(https?:|mailto:)/.test(run.link)
            )
              pv_open_url(run.link);
            if (igIsItemHovered(0)) {
              igSetMouseCursor(ImGuiMouseCursor_Hand);
              igBeginTooltip();
              withoutTextSelection(() =>
                text(run.link ?? "", 15, "regular", palette.ink, -1),
              );
              igEndTooltip();
            }
            igPopID();
          }
          piece = piece.slice(part.length);
          x += partWidth;
          if (piece.length) {
            x = 0;
            y += line;
            measured = igCalcTextSize(piece, false, -1).x;
          }
        }
      }
      igPopFont();
    }
    igSetCursorScreenPos(origin);
    igDummy({ x: width, y: y + line });
    selectionBreak();
  }
  code(source: string, language: string, exporting: boolean) {
    if (this.codeTheme !== currentTheme()) {
      this.codeTokens.clear();
      this.codeTheme = currentTheme();
    }
    const key = `${language}\0${source}`;
    let lines = this.codeTokens.get(key);
    if (!lines) {
      lines = this.highlighter.highlight(source, language);
      this.codeTokens.set(key, lines);
    }
    panel(() => {
      if (exporting) {
        if (language) text(language.toUpperCase(), 11, "bold", palette.muted);
      } else {
        const regular = fonts.regular;
        if (!regular) throw new Error("Fonts are not initialized");
        const width = available();
        igPushFont(regular, 14);
        const copyWidth =
          igCalcTextSize("Copy code", false, -1).x + framePadding.x * 2;
        igAlignTextToFramePadding();
        text(
          language ? language.toUpperCase() : "CODE",
          11,
          "bold",
          palette.muted,
        );
        const labelWidth = igGetItemRectMax().x - igGetItemRectMin().x;
        const gap = width - labelWidth - copyWidth;
        if (gap >= 12) igSameLine(0, gap);
        if (igButton("Copy code", { x: copyWidth, y: 0 }))
          igSetClipboardText(source);
        igPopFont();
      }
      const face = fonts.mono;
      if (!face) throw new Error("Fonts are not initialized");
      const draw = igGetWindowDrawList();
      if (!draw) throw new Error("Cannot access the code canvas");
      const size = 17,
        lineHeight = 26;
      igPushFont(face, size);
      const origin = igGetCursorScreenPos();
      const width = Math.max(20, available());
      let y = 0;
      for (const line of lines) {
        let x = 0;
        for (const token of line) {
          let content = token.content;
          while (content.length) {
            const measured = igCalcTextSize(content, false, -1).x;
            if (x + measured > width && x > 0) {
              x = 0;
              y += lineHeight;
            }
            const part =
              measured > width ? fittingPrefix(content, width - x) : content;
            const partWidth = igCalcTextSize(part, false, -1).x;
            keepLineTogether(origin.y + y, origin.y + y + size + 3);
            ImDrawList_AddText_FontPtr(
              draw,
              face,
              size,
              { x: origin.x + x, y: origin.y + y },
              packed(token.color),
              part,
              0,
            );
            captureText(
              part,
              "mono",
              size,
              { x: origin.x + x, y: origin.y + y },
              partWidth,
            );
            selectionText(
              part,
              "mono",
              size,
              { x: origin.x + x, y: origin.y + y },
              partWidth,
            );
            if (token.fontStyle & 4)
              ImDrawList_AddLine(
                draw,
                { x: origin.x + x, y: origin.y + y + size + 2 },
                { x: origin.x + x + partWidth, y: origin.y + y + size + 2 },
                packed(token.color),
                1,
                0,
              );
            x += partWidth;
            content = content.slice(part.length);
            if (content.length) {
              x = 0;
              y += lineHeight;
            }
          }
        }
        y += lineHeight;
        selectionBreak();
      }
      igSetCursorScreenPos(origin);
      igDummy({ x: width, y: Math.max(lineHeight, y) });
      igPopFont();
    }, palette.code);
  }
  private blocks(tokens: Token[], exporting: boolean, parentHeading?: number) {
    const capture = currentCapture();
    let headingTop: number | undefined;
    const headings: { depth: number; index: number }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i] as MarkedToken;
      const lineStart = capture?.lines.length ?? 0;
      if (capture && token.type === "heading" && headingTop === undefined)
        headingTop = igGetCursorScreenPos().y;
      igPushID_Int(i);
      switch (token.type) {
        case "space":
          break;
        case "paragraph":
        case "text":
          this.inline(
            token.tokens ?? [
              { type: "text", raw: token.text, text: token.text },
            ],
            18,
          );
          break;
        case "heading":
          if (capture) {
            while (
              headings.length &&
              headings[headings.length - 1].depth >= token.depth
            )
              headings.pop();
            const index = captureHeading(
              runs(token.tokens)
                .map((run) => run.value)
                .join(""),
              igGetCursorScreenPos().y,
              headings[headings.length - 1]?.index ?? parentHeading,
            );
            if (index !== undefined)
              headings.push({ depth: token.depth, index });
          }
          this.inline(token.tokens, Math.max(19, 34 - token.depth * 3), true);
          break;
        case "hr":
          igSpacing();
          igSeparator();
          igSpacing();
          break;
        case "code":
          this.code(token.text, token.lang?.split(/\s/)[0] ?? "", exporting);
          break;
        case "blockquote":
          igIndent(20);
          this.blocks(
            token.tokens,
            exporting,
            headings[headings.length - 1]?.index ?? parentHeading,
          );
          igUnindent(20);
          break;
        case "list": {
          let index = token.start === "" ? 1 : token.start;
          for (let n = 0; n < token.items.length; n++) {
            const item = token.items[n];
            igPushID_Int(n);
            const p = igGetCursorScreenPos();
            if (item.task) {
              const draw = igGetWindowDrawList();
              if (!draw) throw new Error("Cannot access the task canvas");
              const a = { x: p.x, y: p.y + 5 };
              const b = { x: p.x + 14, y: p.y + 19 };
              if (item.checked) {
                ImDrawList_AddRectFilled(
                  draw,
                  a,
                  b,
                  packed(palette.accent),
                  3,
                  0,
                );
                ImDrawList_AddLine(
                  draw,
                  { x: a.x + 3, y: a.y + 7 },
                  { x: a.x + 6, y: a.y + 10 },
                  packed(palette.onAccent),
                  1.5,
                  0,
                );
                ImDrawList_AddLine(
                  draw,
                  { x: a.x + 6, y: a.y + 10 },
                  { x: a.x + 11, y: a.y + 4 },
                  packed(palette.onAccent),
                  1.5,
                  0,
                );
              } else
                ImDrawList_AddRect(draw, a, b, packed(palette.muted), 3, 1, 0);
            } else
              text(
                token.ordered ? `${index++}.` : "•",
                18,
                "regular",
                palette.muted,
                -1,
              );
            igSetCursorScreenPos({ x: p.x + 24, y: p.y });
            igIndent(24);
            const children = item.tokens.filter(
              (child) => child.type !== "checkbox",
            );
            if (children.length)
              this.blocks(
                children,
                exporting,
                headings[headings.length - 1]?.index ?? parentHeading,
              );
            else igDummy({ x: available(), y: 26 });
            igUnindent(24);
            igPopID();
          }
          break;
        }
        case "table": {
          const capture = currentCapture();
          const textStart = capture?.text.length ?? 0;
          const rowStarts: number[] = [];
          const tableTop = igGetCursorScreenPos().y;
          if (
            igBeginTable(
              "markdown",
              token.header.length,
              ImGuiTableFlags_BordersInnerH | ImGuiTableFlags_RowBg,
              { x: 0, y: 0 },
              0,
            )
          ) {
            igTableNextRow(ImGuiTableRowFlags_Headers, 0);
            for (const cell of token.header) {
              igTableNextColumn();
              this.inline(cell.tokens, 16, true);
            }
            const textEnd = capture?.text.length ?? 0;
            for (const row of token.rows) {
              igTableNextRow(0, 0);
              if (capture) rowStarts.push(igGetCursorScreenPos().y);
              for (const cell of row) {
                igTableNextColumn();
                this.inline(cell.tokens, 16);
              }
            }
            igEndTable();
            if (capture) {
              const min = igGetItemRectMin(),
                max = igGetItemRectMax();
              captureTable(
                min.x,
                max.x,
                tableTop,
                max.y,
                rowStarts,
                textStart,
                textEnd,
              );
            }
          }
          break;
        }
        case "html":
          text(token.text);
          break;
        case "def":
          break;
        default:
          this.inline([token]);
      }
      const firstLine = capture?.lines[lineStart];
      if (token.type !== "heading" && firstLine && headingTop !== undefined) {
        keepTogether(headingTop, firstLine.bottom);
        headingTop = undefined;
      }
      igPopID();
    }
  }
}
