import { defineLibrary } from "@maligator/cli";

export default defineLibrary({
  headers: [
    "visualize.h",
    "cimgui.h",
    "cimplot.h",
    "SDL3/SDL_misc.h",
    "SDL3/SDL_video.h",
    "SDL3/SDL_events.h",
    "SDL3/SDL_init.h",
    "SDL3/SDL_timer.h",
  ],
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
    ImFontBaked: {
      handle: {},
      fields: { Ascent: { value: true }, Size: { value: true } },
    },
    ImFontAtlas: { handle: {} },
    ImDrawList: { handle: {} },
    ImDrawListSplitter: { handle: { destroy: "ImDrawListSplitter_destroy" } },
    ImPlotSpec_c: { handle: { destroy: "ImPlotSpec_destroy" } },
    ImGuiTableSortSpecs: {
      handle: {},
      fields: { Specs: { array: { length: "SpecsCount" } } },
    },
    PVImage: { handle: { destroy: "pv_image_destroy" } },
  },
  functions: {
    SDL_PushEvent: {
      params: {
        event: {
          inout: true,
          shape: {
            tag: "type",
            cases: {
              SDL_EVENT_PINCH_BEGIN: ["pinch"],
              SDL_EVENT_PINCH_UPDATE: ["pinch"],
              SDL_EVENT_PINCH_END: ["pinch"],
              SDL_EVENT_MOUSE_WHEEL: ["wheel"],
              SDL_EVENT_SYSTEM_THEME_CHANGED: ["common"],
            },
          },
        },
      },
    },
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
    ImFont_CalcWordWrapPosition: { params: { text_end: { end: "text" } } },
    ImFont_GetFontBaked: {
      params: { density: { constant: "-1" } },
      returns: { borrowed: true },
    },
    igTableGetSortSpecs: { returns: { borrowed: true } },
    ImPlot_SetupAxisTicks_doublePtr: {
      params: {
        values: { array: { length: "n_ticks" } },
        labels: { array: { length: "n_ticks" } },
      },
    },
    igCheckbox: { params: { v: { inout: true } } },
    igInputDouble: { params: { v: { inout: true } } },
    igSliderScalar: {
      variants: {
        igSliderDouble: {
          params: {
            data_type: { constant: "ImGuiDataType_Double" },
            p_data: { pointee: "double", inout: true },
            p_min: { pointee: "double", inout: true },
            p_max: { pointee: "double", inout: true },
          },
        },
      },
    },
    igBegin: { params: { p_open: { constant: "NULL" } } },
    igSetNextWindowSizeConstraints: {
      params: {
        custom_callback: { constant: "NULL" },
        custom_callback_data: { constant: "NULL" },
      },
    },
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
    pv_input_text: {
      params: { buffer: { array: { length: "capacity", writable: true } } },
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
      params: { pixels: { bytes: { length: "width * height * 4" } } },
    },
    pv_pixels_deflate_rgb: {
      params: { rgba: { bytes: { length: "width * height * 4" } } },
      returns: { bytes: { length: "length" }, free: "pv_pixels_free" },
    },
    pv_png_write: {
      params: { bytes: { bytes: { length: "width * height * 4" } } },
    },
  },
});
