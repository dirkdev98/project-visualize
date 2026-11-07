import {
  ImGuiWindowFlags_NoDecoration,
  ImPlot_BeginPlot,
  ImPlot_EndPlot,
  ImPlot_GetLastItemColor,
  ImPlot_SetNextAxesToFit,
  ImPlot_SetupAxes,
  ImPlotMarker_Circle,
  ImPlotMarker_None,
  igBegin,
  igEnd,
  igRender,
  igSetNextWindowPos,
  igSetNextWindowSize,
  pv_error,
  pv_plot_series,
  pv_png_write,
  pv_surface_begin,
  pv_surface_capture,
  pv_surface_close,
  pv_surface_open,
} from "maligator:ffi/visualize";

function expect(value, message) {
  if (!value) throw new Error(message);
}
function checked(status) {
  expect(status === 0, pv_error() ?? "Native operation failed");
}
const width = 481,
  height = 160;
const color = { x: 0.2, y: 0.6, z: 0.4, w: 1 };
const x = new Float64Array([0, 1, 2]),
  y = new Float64Array([3, 6, 12]);
const pixels = new Uint8Array(width * height * 4);
checked(pv_surface_open(0));
try {
  for (const kind of [0, 1, 2]) {
    for (let frame = 0; frame < 3; frame++) {
      checked(pv_surface_begin(width, height, 1));
      igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
      igSetNextWindowSize({ x: width, y: height }, 0);
      igBegin("Plot colors", ImGuiWindowFlags_NoDecoration);
      ImPlot_SetNextAxesToFit();
      expect(
        ImPlot_BeginPlot(`Plot ${kind}`, { x: -1, y: 130 }, 0),
        "Plot did not begin",
      );
      ImPlot_SetupAxes("", "", 0, 0);
      pv_plot_series("Observed values", x, y, kind, {
        color,
        line_weight: 2.5,
        marker_size: 4,
        marker: kind === 2 ? ImPlotMarker_Circle : ImPlotMarker_None,
        bar_width: 0.8,
      });
      const legend = ImPlot_GetLastItemColor();
      expect(
        Object.keys(color).every(
          (key) => Math.abs(color[key] - legend[key]) < 0.00001,
        ),
        `Plot kind ${kind} did not use its supplied color in the legend`,
      );
      ImPlot_EndPlot();
      igEnd();
      igRender();
    }
  }
  checked(pv_surface_capture(width, height, pixels));
} finally {
  pv_surface_close();
}
checked(
  pv_png_write(
    process.env.VISUALIZE_NATIVE_CHECK_OUTPUT,
    width,
    height,
    pixels,
  ),
);
console.log(JSON.stringify({ ok: true, kinds: ["line", "bar", "scatter"] }));
