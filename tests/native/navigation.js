import {
  ImGuiIO_AddKeyEvent,
  ImGuiIO_AddMousePosEvent,
  ImGuiIO_AddMouseWheelEvent,
  ImGuiMod_Ctrl,
  ImGuiMod_Super,
  ImGuiWindowFlags_NoDecoration,
  ImGuiWindowFlags_NoMove,
  ImPlot_BeginPlot,
  ImPlot_EndPlot,
  ImPlot_GetPlotLimits,
  ImPlot_GetPlotPos,
  ImPlot_GetPlotSize,
  ImPlot_IsPlotHovered,
  ImPlot_SetNextAxesToFit,
  ImPlot_SetupAxes,
  igBegin,
  igEnd,
  igGetIO_Nil,
  igRender,
  igSetNextWindowPos,
  igSetNextWindowSize,
  pv_png_write,
  pv_surface_begin,
  pv_surface_capture,
  pv_surface_close,
  pv_surface_input_policy,
  pv_surface_open,
  pv_surface_pinch,
  pv_surface_wait,
  SDL_EVENT_PINCH_UPDATE,
  SDL_INIT_EVENTS,
  SDL_Init,
  SDL_PushEvent,
  SDL_QuitSubSystem,
} from "maligator:ffi/visualize";
import { Plots } from "../../src/ui/plots.ts";
import { checked } from "../../src/ui/primitives.ts";

function expect(value, message) {
  if (!value) throw new Error(message);
}
expect(SDL_Init(SDL_INIT_EVENTS), "Cannot initialize native events");
checked(pv_surface_open(0));
const plots = new Plots(),
  x = new Float64Array([0, 1, 2]),
  y = new Float64Array([3, 6, 12]);
const color = { x: 0.2, y: 0.6, z: 0.4, w: 1 };
let limits, position, size, hovered;
try {
  checked(pv_surface_input_policy(0.2, ImGuiMod_Ctrl));
  const io = igGetIO_Nil();
  function frame(fit = false, capture = false) {
    checked(pv_surface_begin(481, 160, 1, capture ? 1 : 0));
    igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
    igSetNextWindowSize({ x: 481, y: 160 }, 0);
    igBegin(
      "Navigation",
      ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove,
    );
    if (fit) ImPlot_SetNextAxesToFit();
    expect(
      ImPlot_BeginPlot("Observations", { x: -1, y: 130 }, 0),
      "Plot did not begin",
    );
    ImPlot_SetupAxes("", "", 0, 0);
    plots.draw("Accepted", x, y, "line", color);
    limits = ImPlot_GetPlotLimits(-1, -1);
    position = ImPlot_GetPlotPos();
    size = ImPlot_GetPlotSize();
    hovered = ImPlot_IsPlotHovered();
    ImPlot_EndPlot();
    igEnd();
    igRender();
  }
  frame(true);
  frame();
  frame();
  const fitted = limits.X.Max - limits.X.Min;
  ImGuiIO_AddMousePosEvent(
    io,
    position.x + size.x / 2,
    position.y + size.y / 2,
  );
  frame();
  frame();
  expect(hovered, "The pointer did not hover the plot");
  frame(false, true);
  expect(!hovered, "A capture retained pointer hover effects");
  expect(
    Math.abs(limits.X.Max - limits.X.Min - fitted) < 0.000001,
    "Capturing changed the fitted view",
  );
  frame();
  frame();
  expect(hovered, "Pointer hover did not return after capturing");
  ImGuiIO_AddMouseWheelEvent(io, 0, 1);
  frame();
  expect(
    Math.abs(limits.X.Max - limits.X.Min - fitted) < 0.000001,
    "Ordinary scrolling accidentally zoomed the graph",
  );
  ImGuiIO_AddKeyEvent(
    io,
    process.platform === "darwin" ? ImGuiMod_Super : ImGuiMod_Ctrl,
    true,
  );
  frame();
  ImGuiIO_AddMouseWheelEvent(io, 0, 1);
  frame();
  frame();
  expect(limits.X.Max - limits.X.Min < fitted, "Modified wheel did not zoom");
  ImGuiIO_AddKeyEvent(
    io,
    process.platform === "darwin" ? ImGuiMod_Super : ImGuiMod_Ctrl,
    false,
  );
  frame();
  frame(true);
  frame();
  expect(
    Math.abs(limits.X.Max - limits.X.Min - fitted) < 0.000001,
    "Reset did not restore the fitted view",
  );
  for (const scale of [1.1, 1.2])
    expect(
      SDL_PushEvent({
        type: SDL_EVENT_PINCH_UPDATE,
        pinch: {
          type: SDL_EVENT_PINCH_UPDATE,
          reserved: 0,
          timestamp: 0n,
          scale,
          windowID: 0,
        },
      }).result,
      "Pinch event was not queued",
    );
  expect(pv_surface_wait(0) === 2, "Pinch did not wake rendering");
  expect(
    Math.abs(pv_surface_pinch() - 1.32) < 0.00001,
    "Pinch changes did not accumulate",
  );
  expect(pv_surface_pinch() === 1, "A pinch change was applied twice");
  const pixels = new Uint8Array(481 * 160 * 4);
  checked(pv_surface_capture(481, 160, pixels));
  checked(
    pv_png_write(process.env.VISUALIZE_NATIVE_CHECK_OUTPUT, 481, 160, pixels),
  );
} finally {
  plots.dispose();
  pv_surface_close();
  SDL_QuitSubSystem(SDL_INIT_EVENTS);
}
console.log(
  JSON.stringify({
    ok: true,
    ordinaryScroll: true,
    modifiedZoom: true,
    reset: true,
    pinch: true,
    neutralCapture: true,
  }),
);
