import {
  ImGuiWindowFlags_NoDecoration,
  ImPlot_BeginPlot,
  ImPlot_EndPlot,
  ImPlot_GetLastItemColor,
  ImPlot_GetPlotLimits,
  ImPlot_SetNextAxesToFit,
  ImPlot_SetupAxes,
  igBegin,
  igEnd,
  igRender,
  igSetNextWindowPos,
  igSetNextWindowSize,
  pv_error,
  pv_png_write,
  pv_surface_begin,
  pv_surface_capture,
  pv_surface_close,
  pv_surface_open,
} from "maligator:ffi/visualize";
import { Plots } from "../../src/ui/plots.ts";
import { boxplot, waterfall } from "../../src/ui/statistics.ts";
import { setTheme } from "../../src/ui/theme.ts";

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
const kinds = [
  "line",
  "bar",
  "horizontal bars",
  "bar",
  "scatter",
  "area",
  "boxplot",
  "waterfall",
];
const themes = ["light", "dark", "light"];
checked(pv_surface_open(0));
const plots = new Plots();
try {
  for (const [index, kind] of kinds.entries()) {
    setTheme(themes[index % themes.length]);
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
      if (kind === "boxplot")
        plots.box("Observed values", 0, boxplot([-12, 3, 4, 5, 6, 100]), color);
      else if (kind === "waterfall")
        plots.waterfall(
          "Observed values",
          waterfall([
            { value: 12, kind: "total" },
            { value: -20 },
            { value: 3 },
          ]),
          [color, color, color],
        );
      else
        plots.draw(
          "Observed values",
          x,
          y,
          kind === "horizontal bars" ? "bar" : kind,
          color,
          0.8,
          kind === "horizontal bars",
        );
      if (kind === "horizontal bars" && frame === 2) {
        const limits = ImPlot_GetPlotLimits(-1, -1);
        expect(
          limits.X.Max >= 12 && limits.Y.Max < 4,
          "Horizontal bars did not exchange value and category axes",
        );
      }
      const legend = ImPlot_GetLastItemColor();
      expect(
        Object.keys(color).every(
          (key) => Math.abs(color[key] - legend[key]) < 0.00001,
        ),
        `Plot kind ${kind} did not use its supplied color in the legend`,
      );
      if (kind === "area" && frame === 2)
        expect(
          ImPlot_GetPlotLimits(-1, -1).Y.Min <= 0,
          "The shaded baseline must participate in axis fitting",
        );
      if (frame === 2 && kind === "boxplot") {
        const limits = ImPlot_GetPlotLimits(-1, -1);
        expect(
          limits.Y.Min <= -12 && limits.Y.Max >= 100,
          "Box plot fitting must retain outliers",
        );
      }
      if (frame === 2 && kind === "waterfall") {
        const limits = ImPlot_GetPlotLimits(-1, -1);
        expect(
          limits.Y.Min <= -8 && limits.Y.Max >= 12,
          "Waterfall fitting must include cumulative endpoints",
        );
      }
      ImPlot_EndPlot();
      igEnd();
      igRender();
    }
  }
  checked(pv_surface_capture(width, height, pixels));
} finally {
  plots.dispose();
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
console.log(JSON.stringify({ ok: true, kinds }));
