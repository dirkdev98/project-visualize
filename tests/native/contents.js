import {
  ImGuiIO_AddMouseButtonEvent,
  ImGuiIO_AddMousePosEvent,
  ImGuiWindowFlags_NoDecoration,
  igBegin,
  igEnd,
  igGetCursorScreenPos,
  igGetFontSize,
  igGetIO_Nil,
  igGetScrollMaxY,
  igRender,
  igSetNextWindowPos,
  igSetNextWindowSize,
  igSetWindowFocus_Str,
  pv_png_write,
  pv_surface_begin,
  pv_surface_capture,
  pv_surface_close,
  pv_surface_open,
} from "maligator:ffi/visualize";
import { DocumentRenderer } from "../../src/ui/content.ts";
import { checked } from "../../src/ui/primitives.ts";
import { initializeTheme, popTheme, pushTheme } from "../../src/ui/theme.ts";

function expect(value, message) {
  if (!value) throw new Error(message);
}
checked(pv_surface_open(0));
initializeTheme("dark");
const renderer = new DocumentRenderer(
  {
    schemaVersion: 1,
    type: "document",
    title: "Fictional field notes",
    body: [
      {
        type: "details",
        title: "Supporting evidence",
        children: [
          {
            type: "markdown",
            content: `## Observations\n\n${"Fictional observations.\n\n".repeat(25)}\n\n## Final check\n\nComplete.`,
          },
        ],
      },
    ],
  },
  undefined,
  { header: false },
);
const target = renderer
  .outline()
  .find((heading) => heading.title === "Final check");
let scrollMax = 0;
let disclosure;
function frame() {
  checked(pv_surface_begin(481, 160, 1, 0));
  pushTheme();
  igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
  igSetNextWindowSize({ x: 481, y: 160 }, 0);
  igBegin("Contents", ImGuiWindowFlags_NoDecoration);
  igSetWindowFocus_Str("Contents");
  const point = igGetCursorScreenPos();
  disclosure = {
    x: point.x + igGetFontSize(),
    y: point.y + igGetFontSize() / 2,
  };
  renderer.body(false);
  scrollMax = igGetScrollMaxY();
  igEnd();
  popTheme();
  igRender();
}
try {
  frame();
  frame();
  const expanded = scrollMax;
  expect(expanded > 0, "The evidence did not extend beyond the viewport");
  const io = igGetIO_Nil();
  ImGuiIO_AddMousePosEvent(io, disclosure.x, disclosure.y);
  frame();
  ImGuiIO_AddMouseButtonEvent(io, 0, true);
  frame();
  ImGuiIO_AddMouseButtonEvent(io, 0, false);
  frame();
  frame();
  expect(
    scrollMax === 0,
    "Clicking the disclosure did not collapse the evidence",
  );
  renderer.navigate(target.id);
  frame();
  frame();
  frame();
  expect(scrollMax > 0, "Navigation did not reveal the collapsed ancestor");
  expect(
    renderer.activeHeading() === target.id,
    "The revealed target was not selected",
  );
  const pixels = new Uint8Array(481 * 160 * 4);
  checked(pv_surface_capture(481, 160, pixels));
  checked(
    pv_png_write(process.env.VISUALIZE_NATIVE_CHECK_OUTPUT, 481, 160, pixels),
  );
} finally {
  renderer.dispose();
  pv_surface_close();
}
console.log(JSON.stringify({ ok: true, disclosure: true, revealTarget: true }));
