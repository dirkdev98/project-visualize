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
  pv_png_write,
  pv_surface_begin,
  pv_surface_capture,
  pv_surface_close,
  pv_surface_limit,
  pv_surface_open,
} from "maligator:ffi/visualize";
import { writeFileSync } from "node:fs";
import type { Artifact, Theme } from "../model.ts";
import { DocumentRenderer, documentState } from "./content.ts";
import { captureLayout, type LayoutCapture } from "./layout.ts";
import { pdfPages, pdfWidth, rasterPdf } from "./pdf.ts";
import { searchablePdf } from "./pdf-text.ts";
import { checked, releasePanels } from "./primitives.ts";
import { fonts, initializeTheme, popTheme, pushTheme } from "./theme.ts";

function canvas(
  renderer: DocumentRenderer,
  width: number,
  height: number,
  padding: { x: number; y: number },
): number {
  igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
  igSetNextWindowSize({ x: width, y: height }, 0);
  igPushStyleVar_Vec2(ImGuiStyleVar_WindowPadding, padding);
  igBegin(
    "artifact",
    ImGuiWindowFlags_NoDecoration |
      ImGuiWindowFlags_NoSavedSettings |
      ImGuiWindowFlags_NoScrollWithMouse |
      ImGuiWindowFlags_NoScrollbar,
  );
  renderer.body(true);
  const used = igGetCursorPosY() + padding.y;
  igEnd();
  igPopStyleVar(1);
  return used;
}

export async function renderArtifact(
  document: Artifact,
  output: string | string[],
  width: number,
  scale: number,
  parameters?: unknown,
  theme?: Theme,
  options: { header?: boolean } = {},
): Promise<number> {
  const files = typeof output === "string" ? [output] : output;
  const pdfs = files.filter((file) => file.toLowerCase().endsWith(".pdf")),
    pngs = files.filter((file) => !file.toLowerCase().endsWith(".pdf"));
  // PDFs lay out at their paper's width so text keeps a print size; when that
  // equals the render width, PNG and PDF share one capture.
  const printWidth = pdfWidth(document.pdf);
  const widths = [
    ...new Set([
      ...(pngs.length ? [width] : []),
      ...(pdfs.length ? [printWidth] : []),
    ]),
  ];
  const state = documentState(document, parameters);
  const partial = options.header === false;
  const captures = new Map<
    number,
    { height: number; pixels: Uint8Array; layout: LayoutCapture }
  >();
  checked(pv_surface_open(0));
  let renderer: DocumentRenderer | undefined;
  try {
    initializeTheme(theme ?? document.theme ?? "light");
    renderer = new DocumentRenderer(document, state, options);
    const limit = pv_surface_limit();
    for (const canvasWidth of widths) {
      const padding = {
        x: canvasWidth < 480 ? (partial ? 24 : 16) : partial ? 48 : 36,
        y: partial ? 40 : 32,
      };
      let height = 0;
      for (let pass = 0; pass < 2; pass++) {
        checked(pv_surface_begin(canvasWidth, limit / scale, scale, 1));
        pushTheme();
        height = Math.ceil(
          canvas(renderer, canvasWidth, limit / scale, padding),
        );
        popTheme();
        igRender();
      }
      height = Math.max(160, height);
      if (height * scale > limit)
        throw new Error(
          "Artifact is too tall to export at this scale; split it into smaller artifacts",
        );
      checked(pv_surface_begin(canvasWidth, height, scale, 1));
      pushTheme();
      const current = renderer;
      const layout = captureLayout(() =>
        canvas(current, canvasWidth, height, padding),
      );
      popTheme();
      igRender();
      const pixels = new Uint8Array(canvasWidth * scale * height * scale * 4);
      checked(pv_surface_capture(canvasWidth * scale, height * scale, pixels));
      // PNGs are written now so only a PDF capture outlives its pass.
      if (canvasWidth === width)
        for (const file of pngs)
          checked(
            pv_png_write(file, canvasWidth * scale, height * scale, pixels),
          );
      captures.set(canvasWidth, {
        height,
        pixels:
          pdfs.length && canvasWidth === printWidth ? pixels : new Uint8Array(),
        layout,
      });
    }
  } finally {
    renderer?.dispose();
    releasePanels();
    for (const key of Object.keys(fonts))
      delete fonts[key as keyof typeof fonts];
    pv_surface_close();
  }
  const print = captures.get(printWidth);
  for (const file of pdfs) {
    if (!print) throw new Error("The PDF capture is missing");
    const plan = pdfPages(printWidth, print.height, print.layout, document.pdf);
    writeFileSync(
      file,
      await searchablePdf(
        rasterPdf(printWidth * scale, print.height * scale, print.pixels, plan),
        print.layout,
        plan,
        document.title,
      ),
    );
  }
  return (captures.get(pngs.length ? width : printWidth) ?? { height: 0 })
    .height;
}
