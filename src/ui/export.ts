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
import type { Artifact, Theme } from "../model.ts";
import { DocumentRenderer, documentState } from "./content.ts";
import { captureLayout, type LayoutCapture } from "./layout.ts";
import { pdfPages, rasterPdf } from "./pdf.ts";
import { searchablePdf } from "./pdf-text.ts";
import { checked, releasePanels } from "./primitives.ts";
import { fonts, initializeTheme, popTheme, pushTheme } from "./theme.ts";

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

export async function renderArtifact(
  document: Artifact,
  output: string | string[],
  width: number,
  scale: number,
  parameters?: unknown,
  theme?: Theme,
): Promise<number> {
  const state = documentState(document, parameters);
  checked(pv_surface_open(0));
  let renderer: DocumentRenderer | undefined;
  let height = 0;
  let pixels: Uint8Array;
  let layout: LayoutCapture;
  try {
    initializeTheme(theme ?? document.theme ?? "light");
    renderer = new DocumentRenderer(document, state);
    const limit = pv_surface_limit();
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
    layout = captureLayout(() =>
      canvas(renderer as DocumentRenderer, width, height),
    );
    popTheme();
    igRender();
    const captured = pv_surface_pixels(width * scale, height * scale);
    if (!captured)
      throw new Error(pv_error() ?? "GPU screenshot readback failed");
    pixels = captured;
  } finally {
    renderer?.dispose();
    releasePanels();
    for (const key of Object.keys(fonts))
      delete fonts[key as keyof typeof fonts];
    pv_surface_close();
  }
  for (const file of typeof output === "string" ? [output] : output) {
    if (file.toLowerCase().endsWith(".pdf")) {
      const plan = pdfPages(width, height, layout, document.pdf);
      writeFileSync(
        file,
        await searchablePdf(
          rasterPdf(width * scale, height * scale, pixels, plan),
          layout,
          plan,
          document.title,
        ),
      );
    } else checked(pv_png_write(file, width * scale, height * scale, pixels));
  }
  return height;
}
