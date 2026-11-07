import { defineLibrary } from "@maligator/cli";

export default defineLibrary({
  headers: ["visualize.h", "cimgui.h", "cimplot.h", "SDL3/SDL_misc.h"],
  find: [
    {
      pkgConfig: "sdl3",
      includeDirs: [".", "../.cache/deps/cimgui", "../.cache/deps/cimplot"],
      defines: { CIMGUI_DEFINE_ENUMS_AND_STRUCTS: "1" },
      libraryDirs: ["../.cache/native"],
      libraries: ["visualize"],
    },
  ],
  types: {
    ImGuiIO: { handle: {} },
    ImFont: { handle: {} },
    ImFontAtlas: { handle: {} },
    ImDrawList: { handle: {} },
    ImDrawListSplitter: { handle: { destroy: "ImDrawListSplitter_destroy" } },
    ImPlotSpec_c: { handle: {} },
    PVImage: { handle: { destroy: "pv_image_destroy" } },
  },
  functions: {
    ImPlot_PlotLine_doublePtrdoublePtr: {
      params: {
        xs: { array: { length: "count" } },
        ys: { array: { length: "count" } },
      },
    },
    ImPlot_PlotBars_doublePtrdoublePtr: {
      params: {
        xs: { array: { length: "count" } },
        ys: { array: { length: "count" } },
      },
    },
    ImPlot_PlotScatter_doublePtrdoublePtr: {
      params: {
        xs: { array: { length: "count" } },
        ys: { array: { length: "count" } },
      },
    },
    ImPlot_PlotShaded_doublePtrdoublePtrInt: {
      params: {
        xs: { array: { length: "count" } },
        ys: { array: { length: "count" } },
      },
    },
    ImFont_CalcTextSizeA: {
      params: {
        text_end: { constant: "NULL" },
        out_remaining: { constant: "NULL" },
      },
    },
    igCheckbox: { params: { v: { inout: true } } },
    pv_slider_double: { params: { value: { inout: true } } },
    igBegin: { params: { p_open: { constant: "NULL" } } },
    igTextUnformatted: { params: { text_end: { constant: "NULL" } } },
    igCalcTextSize: { params: { text_end: { constant: "NULL" } } },
    igGetIO_Nil: { returns: { borrowed: true } },
    igGetFont: { returns: { borrowed: true } },
    igGetWindowDrawList: { returns: { borrowed: true } },
    igStyleColorsLight: { params: { dst: { constant: "NULL" } } },
    ImPlot_StyleColorsLight: { params: { dst: { constant: "NULL" } } },
    ImFontAtlas_AddFontFromFileTTF: {
      params: {
        font_cfg: { constant: "NULL" },
        glyph_ranges: { constant: "NULL" },
      },
      returns: { borrowed: true },
    },
    ImDrawList_AddText_Vec2: { params: { text_end: { constant: "NULL" } } },
    ImDrawList_AddText_FontPtr: {
      params: {
        text_end: { constant: "NULL" },
        cpu_fine_clip_rect: { constant: "NULL" },
      },
    },
    igInputTextWithHint: {
      params: {
        buf: { array: { length: "buf_size", writable: true } },
        callback: { constant: "NULL" },
        user_data: { constant: "NULL" },
      },
    },
    igInputTextMultiline: {
      params: {
        buf: { array: { length: "buf_size", writable: true } },
        callback: { constant: "NULL" },
        user_data: { constant: "NULL" },
      },
    },
    pv_font_atlas: { returns: { borrowed: true } },
    pv_surface_capture: {
      params: { pixels: { bytes: { length: "byte_count" } } },
    },
    pv_png_write: { params: { bytes: { bytes: { length: "byte_count" } } } },
  },
});
