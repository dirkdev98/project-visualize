import { deflateSync } from "node:zlib";
import type { Artifact } from "../model.ts";
import {
  type LayoutCapture,
  pageBottom,
  type TableCapture,
  type VerticalRange,
} from "./layout.ts";

export interface PageSlice extends VerticalRange {
  headerHeight: number;
  repeats: TableCapture[];
}
export interface PdfPages {
  width: number;
  height: number;
  margin: number;
  factor: number;
  slices: PageSlice[];
}
export function pdfPages(
  width: number,
  height: number,
  layout: LayoutCapture,
  options: Artifact["pdf"],
): PdfPages {
  const portrait = options?.paper === "letter" ? [612, 792] : [595.276, 841.89];
  const [pageWidth, pageHeight] =
    options?.orientation === "portrait" ? portrait : [portrait[1], portrait[0]];
  const margin = 24;
  const factor = (pageWidth - 2 * margin) / width;
  const capacity = (pageHeight - 2 * margin - 12) / factor;
  const regions = [
    ...layout.regions,
    ...layout.tables.flatMap((table) => table.rows),
  ];
  const slices: PageSlice[] = [];
  let top = 0;
  while (top < height) {
    let repeats = layout.tables
      .filter(
        (table) =>
          table.header.bottom <= top &&
          table.rows.some((row) => row.bottom > top),
      )
      .sort((a, b) => a.left - b.left);
    if (repeats.some((table, i) => i > 0 && table.left < repeats[i - 1].right))
      repeats = [];
    let headerHeight = repeats.length
      ? Math.max(
          ...repeats.map((table) => table.header.bottom - table.header.top),
        ) + 8
      : 0;
    const nextLine = layout.lines
      .filter((line) => line.top >= top)
      .reduce((end, line) => Math.min(end, line.bottom), height);
    if (headerHeight + nextLine - top >= capacity) {
      repeats = [];
      headerHeight = 0;
    }
    let bottom: number;
    try {
      bottom = pageBottom(
        top,
        height,
        capacity - headerHeight,
        regions,
        layout.lines,
      );
    } catch (error) {
      if (!headerHeight) throw error;
      repeats = [];
      headerHeight = 0;
      bottom = pageBottom(top, height, capacity, regions, layout.lines);
    }
    slices.push({ top, bottom, headerHeight, repeats });
    top = bottom;
  }
  return { width: pageWidth, height: pageHeight, margin, factor, slices };
}
export function rasterPdf(
  width: number,
  height: number,
  pixels: Uint8Array,
  pages: PdfPages,
): Buffer {
  const rgb = Buffer.allocUnsafe(width * height * 3);
  for (let source = 0, dest = 0; source < pixels.length; source += 4) {
    rgb[dest++] = pixels[source];
    rgb[dest++] = pixels[source + 1];
    rgb[dest++] = pixels[source + 2];
  }
  const compressed = deflateSync(rgb, { level: 1 });
  const chunks: Buffer[] = [];
  let offset = 0;
  function append(value: string | Uint8Array) {
    const bytes =
      typeof value === "string"
        ? Buffer.from(value, "latin1")
        : Buffer.from(value);
    chunks.push(bytes);
    offset += bytes.length;
  }
  const offsets = [0];
  function object(id: number, body: string) {
    offsets[id] = offset;
    append(`${id} 0 obj\n${body}\nendobj\n`);
  }
  append("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.slices.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  object(2, `<< /Type /Pages /Count ${pages.slices.length} /Kids [${kids}] >>`);
  offsets[3] = offset;
  append(
    `3 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
  );
  append(compressed);
  append("\nendstream\nendobj\n");
  object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const imageWidth = pages.width - 2 * pages.margin;
  const imageHeight = (imageWidth * height) / width;
  for (const [index, slice] of pages.slices.entries()) {
    const id = 5 + index * 2;
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pages.width} ${pages.height}] /Resources << /XObject << /Image 3 0 R >> /Font << /F1 4 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    const top = pages.height - pages.margin;
    function paintRegion(
      left: number,
      right: number,
      sourceTop: number,
      bottom: number,
      destinationTop: number,
    ) {
      const clipHeight = (bottom - sourceTop) * pages.factor;
      return `q\n${pages.margin + left * pages.factor} ${destinationTop - clipHeight} ${(right - left) * pages.factor} ${clipHeight} re W n\n${imageWidth} 0 0 ${imageHeight} ${pages.margin} ${destinationTop - imageHeight + sourceTop * pages.factor} cm\n/Image Do\nQ\n`;
    }
    const background = [pixels[0], pixels[1], pixels[2]]
      .map((channel) => channel / 255)
      .join(" ");
    let paint = slice.headerHeight
      ? `q\n${background} rg ${pages.margin} ${top - slice.headerHeight * pages.factor} ${imageWidth} ${slice.headerHeight * pages.factor} re f\nQ\n`
      : "";
    paint += paintRegion(
      0,
      imageWidth / pages.factor,
      slice.top,
      slice.bottom,
      top - slice.headerHeight * pages.factor,
    );
    for (const table of slice.repeats)
      paint += paintRegion(
        table.left,
        table.right,
        table.header.top,
        table.header.bottom,
        top,
      );
    paint += `BT /F1 9 Tf 0.4 0.45 0.5 rg ${pages.width - 64} 12 Td (${index + 1} / ${pages.slices.length}) Tj ET\n`;
    object(
      id + 1,
      `<< /Length ${Buffer.byteLength(paint)} >>\nstream\n${paint}endstream`,
    );
  }
  const xref = offset;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const position of offsets.slice(1))
    append(`${String(position).padStart(10, "0")} 00000 n \n`);
  append(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  return Buffer.concat(chunks);
}
