import { Marked } from "marked";
import type { Artifact } from "../model.ts";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}

export function markdown(
  source: string,
  document: Artifact,
  highlights: Record<string, string> = {},
  width = Infinity,
): string {
  const parser = new Marked({
    renderer: {
      table({ header, rows }) {
        if (width < 480 && header.length > 2)
          return `<div class="pv-records">${rows.map((row) => `<dl>${header.map((cell, index) => `<div><dt>${this.parser.parseInline(cell.tokens)}</dt><dd>${this.parser.parseInline(row[index]?.tokens ?? [])}</dd></div>`).join("")}</dl>`).join("")}</div>`;
        const cells = (row: typeof header, tag: string) =>
          row
            .map(
              (cell) =>
                `<${tag}${cell.align ? ` style="text-align:${cell.align}"` : ""}>${this.parser.parseInline(cell.tokens)}</${tag}>`,
            )
            .join("");
        return `<table><thead><tr>${cells(header, "th")}</tr></thead><tbody>${rows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("")}</tbody></table>`;
      },
      listitem({ task, checked, tokens }) {
        return `<li${task ? ' class="pv-task"' : ""}>${task ? `<input type="checkbox" disabled${checked ? " checked" : ""}>` : ""}${this.parser.parse(tokens)}</li>`;
      },
      html({ text }) {
        return escapeHtml(text);
      },
      code({ text, lang }) {
        const language = lang?.split(/\s/)[0] ?? "";
        return `<div class="pv-code">${language ? `<small>${escapeHtml(language.toUpperCase())}</small>` : ""}<pre><code>${highlights[`${language}\n${text}`] ?? escapeHtml(text)}</code></pre></div>`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        return /^(https?:|mailto:)/i.test(href)
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
          : text;
      },
      image({ href, text }) {
        const image = href.startsWith("asset:")
          ? document.assets?.[href.slice(6)]
          : undefined;
        return image
          ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(text)}">`
          : escapeHtml(text);
      },
    },
  });
  return parser.parse(source, { async: false });
}

export function svg(
  width: number,
  height: number,
  title: string,
  content: string,
  attributes = "",
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}" ${attributes}><title>${escapeHtml(title)}</title>${content}</svg>`;
}

export function label(
  x: number,
  y: number,
  value: unknown,
  size = 13,
  anchor = "middle",
  attributes = "",
): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="var(--pv-muted)" ${attributes}>${escapeHtml(value)}</text>`;
}

export function wrap(
  value: string,
  width: number,
  size: number,
  measure: (value: string, size: number) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && measure(`${line} ${word}`, size) > width) {
        lines.push(line);
        line = "";
      }
      for (const character of word) {
        if (line && measure(line + character, size) > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
      line += " ";
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
