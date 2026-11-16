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
  // PDFs lay out at their paper's width so text keeps a print size, and use at
  // least 2x density when the canvas fits the surface, because a 1x raster
  // blurs printed text. A PNG with the same width and density shares the capture.
  const printWidth = pdfWidth(document.pdf),
    printScale = Math.max(scale, 2);
  const state = documentState(document, parameters);
  const partial = options.header === false;
  let pngHeight = 0;
  let print: Capture | undefined;
  checked(pv_surface_open(0));
  let renderer: DocumentRenderer | undefined;
  try {
    initializeTheme(theme ?? document.theme ?? "light");
    const current = new DocumentRenderer(document, state, options);
    renderer = current;
    const limit = pv_surface_limit();
    const capture = (canvasWidth: number, canvasScale: number) => {
      const padding = {
        x: canvasWidth < 480 ? (partial ? 24 : 16) : partial ? 48 : 36,
        y: partial ? 40 : 32,
      };
      let height = 0;
      for (let pass = 0; pass < 2; pass++) {
        checked(
          pv_surface_begin(canvasWidth, limit / canvasScale, canvasScale, 1),
        );
        pushTheme();
        height = Math.ceil(
          canvas(current, canvasWidth, limit / canvasScale, padding),
        );
        popTheme();
        igRender();
      }
      height = Math.max(160, height);
      if (height * canvasScale > limit) return undefined;
      checked(pv_surface_begin(canvasWidth, height, canvasScale, 1));
      pushTheme();
      const layout = captureLayout(() =>
        canvas(current, canvasWidth, height, padding),
      );
      popTheme();
      igRender();
      const pixels = new Uint8Array(
        canvasWidth * canvasScale * height * canvasScale * 4,
      );
      checked(
        pv_surface_capture(
          canvasWidth * canvasScale,
          height * canvasScale,
          pixels,
        ),
      );
      return { width: canvasWidth, scale: canvasScale, height, pixels, layout };
    };
    const tooTall = () =>
      new Error(
        "Artifact is too tall to export at this scale; split it into smaller artifacts",
      );
    if (pngs.length) {
      const png = capture(width, scale);
      if (!png) throw tooTall();
      for (const file of pngs)
        checked(
          pv_png_write(file, width * scale, png.height * scale, png.pixels),
        );
      pngHeight = png.height;
      if (width === printWidth && scale === printScale) print = png;
    }
    if (pdfs.length && !print)
      print =
        capture(printWidth, printScale) ??
        (printScale === scale ? undefined : capture(printWidth, scale));
    if (pdfs.length && !print) throw tooTall();
  } finally {
    renderer?.dispose();
    releasePanels();
    for (const key of Object.keys(fonts))
      delete fonts[key as keyof typeof fonts];
    pv_surface_close();
  }
  for (const file of pdfs) {
    if (!print) throw new Error("The PDF capture is missing");
    const plan = pdfPages(
      print.width,
      print.height,
      print.layout,
      document.pdf,
    );
    writeFileSync(
      file,
      await searchablePdf(
        rasterPdf(
          print.width * print.scale,
          print.height * print.scale,
          print.pixels,
          plan,
        ),
        print.layout,
        plan,
        document.title,
      ),
    );
  }
  return pngs.length ? pngHeight : (print?.height ?? 0);
}

interface Capture {
  width: number;
  scale: number;
  height: number;
  pixels: Uint8Array;
  layout: LayoutCapture;
}
