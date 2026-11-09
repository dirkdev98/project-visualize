import { pv_error, pv_pixels_deflate_rgb } from "maligator:ffi/visualize";
import type { Artifact } from "../model.ts";
import {
  type LayoutCapture,
  pageBottom,
  type TableCapture,
  type VerticalRange,
} from "./layout.ts";

export interface PageSlice extends VerticalRange {
  factor: number;
  left: number;
  headerHeight: number;
  repeats: TableCapture[];
}
export interface PdfPages {
  width: number;
  height: number;
  margin: number;
  contentWidth: number;
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
  const figureGroups: (VerticalRange & { diagram: boolean })[] = [];
  const textAndRows = [
    ...layout.lines,
    ...layout.tables.flatMap((table) => table.rows),
  ];
  for (const region of layout.regions
    .filter((region) => region.kind)
    .sort((a, b) => a.top - b.top)) {
    let bottom = region.bottom;
    // Authored breaks guard against antialiasing inside the preceding block's trailing space.
    const guardedBottom = Math.max(0, Math.floor(bottom) - 1);
    if (layout.breaks.includes(guardedBottom)) bottom = guardedBottom;
    let previous: number;
    do {
      previous = bottom;
      for (const range of textAndRows)
        if (range.top < bottom && range.bottom > bottom) bottom = range.bottom;
    } while (bottom > previous);
    const last = figureGroups[figureGroups.length - 1];
    if (last && region.top < last.bottom) {
      last.bottom = Math.max(last.bottom, bottom);
      last.diagram ||= region.kind === "diagram";
    } else
      figureGroups.push({
        top: region.top,
        bottom,
        diagram: region.kind === "diagram",
      });
  }
  const slices: PageSlice[] = [];
  let contentBottom = 0;
  for (const region of layout.regions)
    contentBottom = Math.max(contentBottom, region.bottom);
  for (const line of layout.lines)
    contentBottom = Math.max(contentBottom, line.bottom);
  if (!contentBottom) contentBottom = height;
  // The antialiasing guard before a boundary must not turn trailing padding into a section.
  const boundaries = layout.breaks.filter(
    (boundary) =>
      layout.regions.some((region) => region.top >= boundary) ||
      layout.lines.some((line) => line.top >= boundary),
  );
  let top = 0;
  while (top < height && top < contentBottom) {
    const authoredBottom = boundaries.reduce(
      (bottom, boundary) =>
        boundary > top ? Math.min(bottom, boundary) : bottom,
      height,
    );
    const diagram = figureGroups.find(
      (group) =>
        group.diagram &&
        group.top >= top &&
        group.bottom - group.top > capacity &&
        group.bottom <= authoredBottom,
    );
    const prefix =
      diagram &&
      (layout.lines.some((line) => line.top >= top && line.top < diagram.top) ||
        regions.some(
          (region) =>
            region.top >= top &&
            region.bottom <= diagram.top &&
            region.bottom > region.top,
        ));
    const fitsIntroduction =
      diagram &&
      diagram.top - top <= capacity * 0.4 &&
      (diagram.bottom - diagram.top) / (diagram.bottom - top) >= 0.85;
    const wholeDiagram = diagram && (!prefix || fitsIntroduction);
    const sectionBottom =
      diagram && prefix && !fitsIntroduction
        ? Math.min(authoredBottom, diagram.top)
        : authoredBottom;
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
    if (!wholeDiagram && headerHeight + nextLine - top >= capacity) {
      repeats = [];
      headerHeight = 0;
    }
    if (wholeDiagram) {
      const pageFactor =
        (pageHeight - 2 * margin - 12) / (diagram.bottom - top + headerHeight);
      slices.push({
        top,
        bottom: diagram.bottom,
        factor: pageFactor,
        left: (pageWidth - width * pageFactor) / 2,
        headerHeight,
        repeats,
      });
      top = diagram.bottom;
      continue;
    }
    let bottom: number;
    try {
      bottom = pageBottom(
        top,
        sectionBottom,
        capacity - headerHeight,
        regions,
        layout.lines,
      );
    } catch (error) {
      if (!headerHeight) throw error;
      repeats = [];
      headerHeight = 0;
      bottom = pageBottom(top, sectionBottom, capacity, regions, layout.lines);
    }
    let pageFactor = factor;
    // A modest fit adjustment keeps a short introduction with its near-fitting figure.
    if (!headerHeight && bottom - top < capacity * 0.4) {
      const candidates = figureGroups.filter(
        (region) =>
          region.top >= top &&
          region.top <= bottom + 1 &&
          region.bottom - region.top <= capacity &&
          region.bottom > top + capacity &&
          region.bottom <= Math.min(sectionBottom, top + capacity / 0.85),
      );
      if (candidates.length) {
        const limit = Math.min(sectionBottom, top + capacity / 0.85);
        const protectedRanges = [
          ...regions.filter(
            (region) => region.bottom - region.top <= capacity / 0.85,
          ),
          ...layout.lines,
        ];
        const ends = candidates
          .map((candidate) => {
            let end = candidate.bottom;
            let previous: number;
            do {
              previous = end;
              for (const range of protectedRanges)
                if (range.top < end && range.bottom > end) end = range.bottom;
            } while (end > previous && end <= limit);
            return end;
          })
          .filter((end) => end <= limit);
        if (ends.length) {
          bottom = Math.min(...ends);
          pageFactor = (pageHeight - 2 * margin - 12) / (bottom - top);
        }
      }
    }
    slices.push({
      top,
      bottom,
      factor: pageFactor,
      left: (pageWidth - width * pageFactor) / 2,
      headerHeight,
      repeats,
    });
    top = bottom;
  }
  return {
    width: pageWidth,
    height: pageHeight,
    margin,
    contentWidth: width,
    slices,
  };
}
export function rasterPdf(
  width: number,
  height: number,
  pixels: Uint8Array,
  pages: PdfPages,
): Buffer {
  const compressed = pv_pixels_deflate_rgb(width, height, pixels);
  if (!compressed) throw new Error(pv_error() ?? "Pixel compression failed");
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
  for (const [index, slice] of pages.slices.entries()) {
    const logicalWidth = pages.contentWidth;
    const imageWidth = logicalWidth * slice.factor;
    const imageHeight = (imageWidth * height) / width;
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
      const clipHeight = (bottom - sourceTop) * slice.factor;
      return `q\n${slice.left + left * slice.factor} ${destinationTop - clipHeight} ${(right - left) * slice.factor} ${clipHeight} re W n\n${imageWidth} 0 0 ${imageHeight} ${slice.left} ${destinationTop - imageHeight + sourceTop * slice.factor} cm\n/Image Do\nQ\n`;
    }
    const background = [pixels[0], pixels[1], pixels[2]]
      .map((channel) => channel / 255)
      .join(" ");
    let paint = `q\n${background} rg 0 0 ${pages.width} ${pages.height} re f\nQ\n`;
    paint += paintRegion(
      0,
      logicalWidth,
      slice.top,
      slice.bottom,
      top - slice.headerHeight * slice.factor,
    );
    for (const table of slice.repeats)
      paint += paintRegion(
        table.left,
        table.right,
        table.header.top,
        table.header.bottom,
        top,
      );
    const footer =
      pixels[0] + pixels[1] + pixels[2] < 384
        ? "0.72 0.72 0.77"
        : "0.4 0.4 0.45";
    paint += `BT /F1 9 Tf ${footer} rg ${pages.width - 64} 12 Td (${index + 1} / ${pages.slices.length}) Tj ET\n`;
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
