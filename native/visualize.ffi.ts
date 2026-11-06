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
    ImDrawList: { handle: {} },
    ImGuiStyle: { handle: {} },
    ImGuiIO: { handle: {} },
    ImPlotStyle: { handle: {} },
  },
  functions: {
    igBegin: { params: { p_open: { constant: "NULL" } } },
    igTextUnformatted: { params: { text_end: { constant: "NULL" } } },
    igCalcTextSize: { params: { text_end: { constant: "NULL" } } },
    igGetFont: { returns: { borrowed: true } },
    igGetWindowDrawList: { returns: { borrowed: true } },
    igGetStyle: { returns: { borrowed: true } },
    igGetIO_Nil: { returns: { borrowed: true } },
    ImPlot_GetStyle: { returns: { borrowed: true } },
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
  },
});
