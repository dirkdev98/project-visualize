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
import { pdfPages, rasterPdf } from "./pdf.ts";
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
  const state = documentState(document, parameters);
  const partial = options.header === false;
  const padding = {
    x: width < 480 ? (partial ? 24 : 16) : partial ? 48 : 36,
    y: partial ? 40 : 32,
  };
  checked(pv_surface_open(0));
  let renderer: DocumentRenderer | undefined;
  let height = 0;
  let pixels: Uint8Array;
  let layout: LayoutCapture;
  try {
    initializeTheme(theme ?? document.theme ?? "light");
    renderer = new DocumentRenderer(document, state, options);
    const limit = pv_surface_limit();
    for (let pass = 0; pass < 2; pass++) {
      checked(pv_surface_begin(width, limit / scale, scale, 1));
      pushTheme();
      height = Math.ceil(canvas(renderer, width, limit / scale, padding));
      popTheme();
      igRender();
    }
    height = Math.max(160, height);
    if (height * scale > limit)
      throw new Error(
        "Artifact is too tall to export at this scale; split it into smaller artifacts",
      );
    checked(pv_surface_begin(width, height, scale, 1));
    pushTheme();
    layout = captureLayout(() =>
      canvas(renderer as DocumentRenderer, width, height, padding),
    );
    popTheme();
    igRender();
    pixels = new Uint8Array(width * scale * height * scale * 4);
    checked(pv_surface_capture(width * scale, height * scale, pixels));
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
