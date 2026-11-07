import {
  ImGuiStyleVar_WindowPadding,
  ImGuiWindowFlags_NoDecoration,
  ImGuiWindowFlags_NoSavedSettings,
  ImGuiWindowFlags_NoScrollbar,
  ImGuiWindowFlags_NoScrollWithMouse,
  igBegin,
  igEnd,
  igGetCursorPosY,
  igPopStyleVar,
  igPushStyleVar_Vec2,
  igRender,
  igSetNextWindowPos,
  igSetNextWindowSize,
  pv_error,
  pv_png_write,
  pv_surface_begin,
  pv_surface_close,
  pv_surface_limit,
  pv_surface_open,
  pv_surface_pixels,
} from "maligator:ffi/visualize";
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import type { Artifact } from "../model.ts";
import { DocumentRenderer, documentState } from "./content.ts";
import { checked } from "./primitives.ts";
import { fonts, initializeTheme, popTheme, pushTheme } from "./theme.ts";

function pdf(file: string, width: number, height: number, pixels: Uint8Array) {
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
  append("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets = [0];
  function object(id: number, body: string) {
    offsets.push(offset);
    append(`${id} 0 obj\n${body}\nendobj\n`);
  }
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Count 1 /Kids [3 0 R] >>");
  const pageWidth = 720,
    pageHeight = (pageWidth * height) / width;
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Image 4 0 R >> >> /Contents 5 0 R >>`,
  );
  offsets.push(offset);
  append(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
  );
  append(compressed);
  append("\nendstream\nendobj\n");
  const paint = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Image Do\nQ\n`;
  object(
    5,
    `<< /Length ${Buffer.byteLength(paint)} >>\nstream\n${paint}endstream`,
  );
  const xref = offset;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const position of offsets.slice(1))
    append(`${String(position).padStart(10, "0")} 00000 n \n`);
  append(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  writeFileSync(file, Buffer.concat(chunks));
}

function canvas(
  renderer: DocumentRenderer,
  width: number,
  height: number,
): number {
  igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
  igSetNextWindowSize({ x: width, y: height }, 0);
  igPushStyleVar_Vec2(ImGuiStyleVar_WindowPadding, { x: 36, y: 32 });
  igBegin(
    "artifact",
    ImGuiWindowFlags_NoDecoration |
      ImGuiWindowFlags_NoSavedSettings |
      ImGuiWindowFlags_NoScrollWithMouse |
      ImGuiWindowFlags_NoScrollbar,
  );
  renderer.body(true);
  const used = igGetCursorPosY() + 32;
  igEnd();
  igPopStyleVar(1);
  return used;
}

export function renderArtifact(
  document: Artifact,
  output: string | string[],
  width: number,
  scale: number,
  parameters?: unknown,
): number {
  const state = documentState(document, parameters);
  checked(pv_surface_open(0));
  let renderer: DocumentRenderer | undefined;
  try {
    initializeTheme();
    renderer = new DocumentRenderer(document, state);
    const limit = pv_surface_limit();
    let height = 0;
    for (let pass = 0; pass < 2; pass++) {
      checked(pv_surface_begin(width, limit / scale, scale));
      pushTheme();
      height = Math.ceil(canvas(renderer, width, limit / scale));
      popTheme();
      igRender();
    }
    height = Math.max(160, height);
    if (height * scale > limit)
      throw new Error(
        "Artifact is too tall to export at this scale; split it into smaller artifacts",
      );
    checked(pv_surface_begin(width, height, scale));
    pushTheme();
    canvas(renderer, width, height);
    popTheme();
    igRender();
    const pixels = pv_surface_pixels(width * scale, height * scale);
    if (!pixels)
      throw new Error(pv_error() ?? "GPU screenshot readback failed");
    for (const file of typeof output === "string" ? [output] : output) {
      if (file.toLowerCase().endsWith(".pdf"))
        pdf(file, width * scale, height * scale, pixels);
      else checked(pv_png_write(file, width * scale, height * scale, pixels));
    }
    return height;
  } finally {
    renderer?.dispose();
    for (const key of Object.keys(fonts))
      delete fonts[key as keyof typeof fonts];
    pv_surface_close();
  }
}
