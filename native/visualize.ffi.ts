import { defineLibrary } from "@maligator/cli";

export default defineLibrary({
  headers: ["visualize.h", "cimgui.h", "cimplot.h"],
  find: [
    {
      includeDirs: [".", "../.cache/deps/cimgui", "../.cache/deps/cimplot"],
      defines: { CIMGUI_DEFINE_ENUMS_AND_STRUCTS: "1" },
      libraryDirs: ["../.cache/native"],
      libraries: ["visualize"],
    },
  ],
  types: {
    ImFont: { handle: {} },
    ImFontAtlas: { handle: {} },
    ImDrawList: { handle: {} },
    ImDrawListSplitter: { handle: { destroy: "ImDrawListSplitter_destroy" } },
    PVImage: { handle: { destroy: "pv_image_destroy" } },
  },
  functions: {
    igCheckbox: { params: { v: { inout: true } } },
    pv_slider_double: { params: { value: { inout: true } } },
    igBegin: { params: { p_open: { constant: "NULL" } } },
    igTextUnformatted: { params: { text_end: { constant: "NULL" } } },
    igCalcTextSize: { params: { text_end: { constant: "NULL" } } },
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
    pv_surface_pixels: {
      params: { byte_count: { out: true } },
      returns: { bytes: { length: "byte_count" }, free: "pv_bytes_free" },
    },
    pv_png_write: { params: { bytes: { bytes: { length: "byte_count" } } } },
    pv_plot_series: {
      params: {
        x: { array: { length: "count" } },
        y: { array: { length: "count" } },
      },
    },
  },
});
