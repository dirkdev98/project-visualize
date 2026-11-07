import { deflateSync } from "node:zlib";
import type { Artifact } from "../model.ts";
import { type LayoutCapture, paginate, type VerticalRange } from "./layout.ts";

export interface PdfPages {
  width: number;
  height: number;
  margin: number;
  factor: number;
  slices: VerticalRange[];
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
  return {
    width: pageWidth,
    height: pageHeight,
    margin,
    factor,
    slices: paginate(
      height,
      (pageHeight - 2 * margin - 12) / factor,
      layout.regions,
    ),
  };
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
    const clipHeight = (slice.bottom - slice.top) * pages.factor;
    const top = pages.height - pages.margin;
    const paint = `q\n${pages.margin} ${top - clipHeight} ${imageWidth} ${clipHeight} re W n\n${imageWidth} 0 0 ${imageHeight} ${pages.margin} ${top - imageHeight + slice.top * pages.factor} cm\n/Image Do\nQ\nBT /F1 9 Tf 0.4 0.45 0.5 rg ${pages.width - 64} 12 Td (${index + 1} / ${pages.slices.length}) Tj ET\n`;
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
