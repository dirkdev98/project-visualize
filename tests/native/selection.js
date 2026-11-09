import {
  ImGuiIO_AddKeyEvent,
  ImGuiIO_AddMouseButtonEvent,
  ImGuiIO_AddMousePosEvent,
  ImGuiKey_A,
  ImGuiKey_C,
  ImGuiKey_V,
  ImGuiKey_Z,
  ImGuiMod_Ctrl,
  ImGuiMod_Shift,
  ImGuiMod_Super,
  ImGuiWindowFlags_NoDecoration,
  ImGuiWindowFlags_NoMove,
  igBegin,
  igEnd,
  igGetClipboardText,
  igGetCursorScreenPos,
  igGetIO_Nil,
  igGetItemRectMax,
  igRender,
  igSetClipboardText,
  igSetKeyboardFocusHere,
  igSetNextWindowPos,
  igSetNextWindowSize,
  igSetWindowFocus_Str,
  pv_png_write,
  pv_surface_begin,
  pv_surface_capture,
  pv_surface_close,
  pv_surface_open,
} from "maligator:ffi/visualize";
import { checked, input, inputBuffer, text } from "../../src/ui/primitives.ts";
import { RichText } from "../../src/ui/richtext.ts";
import { TextSelection, withTextSelection } from "../../src/ui/selection.ts";
import { initializeTheme, popTheme, pushTheme } from "../../src/ui/theme.ts";

function expect(value, message) {
  if (!value) throw new Error(message);
}
checked(pv_surface_open(0));
try {
  initializeTheme("light");
  const io = igGetIO_Nil();
  const selection = new TextSelection();
  const rich = new RichText(() => 0);
  const query = inputBuffer("fictional query");
  let focusInput = false;
  let first, last, lastEnd;
  function frame() {
    checked(pv_surface_begin(481, 160, 1, 0));
    pushTheme();
    igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
    igSetNextWindowSize({ x: 481, y: 160 }, 0);
    igBegin(
      "Selection",
      ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove,
    );
    igSetWindowFocus_Str("Selection");
    withTextSelection(selection, () => {
      first = igGetCursorScreenPos();
      text("café Ω and satellites", 18);
      rich.markdown("A **formatted** sentence.", false);
      last = igGetCursorScreenPos();
      text("Final evidence", 18);
      lastEnd = { x: igGetItemRectMax().x - 0.1, y: last.y };
      rich.code(
        'const label = "café Ω";\n\treturn label;',
        "javascript",
        false,
      );
      if (focusInput) {
        igSetKeyboardFocusHere(0);
        focusInput = false;
      }
      input("##query", "Find evidence", query);
    });
    igEnd();
    popTheme();
    igRender();
  }
  function mouse(point, down) {
    ImGuiIO_AddMousePosEvent(io, point.x, point.y + 8);
    if (down !== undefined) ImGuiIO_AddMouseButtonEvent(io, 0, down);
    frame();
  }
  function chord(key) {
    const modifier =
      process.platform === "darwin" ? ImGuiMod_Super : ImGuiMod_Ctrl;
    ImGuiIO_AddKeyEvent(io, modifier, true);
    ImGuiIO_AddKeyEvent(io, key, true);
    frame();
    frame();
    ImGuiIO_AddKeyEvent(io, key, false);
    ImGuiIO_AddKeyEvent(io, modifier, false);
    frame();
    frame();
  }
  frame();
  frame();
  chord(ImGuiKey_A);
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText().startsWith("café Ω and satellites"),
    "Select all requires no pre-existing selection",
  );
  mouse(first);
  mouse(first, true);
  mouse({ x: last.x + 300, y: last.y });
  mouse({ x: last.x + 300, y: last.y }, false);
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText() ===
      "café Ω and satellites\nA formatted sentence.\nFinal evidence",
    `Forward Unicode/formatted selection copied ${JSON.stringify(igGetClipboardText())}`,
  );
  mouse(lastEnd);
  igSetClipboardText("Before reverse selection");
  mouse(lastEnd, true);
  mouse(first);
  mouse(first, false);
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText() ===
      "café Ω and satellites\nA formatted sentence.\nFinal evidence",
    "Reverse selection did not preserve reading order",
  );
  mouse(first);
  mouse(first, true);
  mouse(first, false);
  mouse(first, true);
  mouse(first, false);
  igSetClipboardText("Before word selection");
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText() === "café",
    "Double click did not select the Unicode word",
  );
  mouse(first, true);
  mouse(first, false);
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText() === "café Ω and satellites\n",
    `Triple click copied ${JSON.stringify(igGetClipboardText())}`,
  );
  for (let i = 0; i < 25; i++) frame();
  mouse(first, true);
  mouse(first, false);
  mouse(first, true);
  mouse({ x: first.x + 90, y: first.y });
  mouse({ x: first.x + 90, y: first.y }, false);
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText().startsWith("café Ω and"),
    "Double-click dragging expands by words",
  );
  for (let i = 0; i < 25; i++) frame();
  mouse(first, true);
  mouse(first, false);
  ImGuiIO_AddKeyEvent(io, ImGuiMod_Shift, true);
  frame();
  mouse(lastEnd, true);
  mouse(lastEnd, false);
  ImGuiIO_AddKeyEvent(io, ImGuiMod_Shift, false);
  frame();
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText().endsWith("Final evidence"),
    "Shift-click extends from the existing anchor",
  );
  chord(ImGuiKey_A);
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText().endsWith('const label = "café Ω";\n\treturn label;\n'),
    `Select all copied ${JSON.stringify(igGetClipboardText())}`,
  );
  focusInput = true;
  frame();
  frame();
  chord(ImGuiKey_A);
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText() === "fictional query",
    "Document selection intercepted an editable control",
  );
  igSetClipboardText("edited query");
  chord(ImGuiKey_V);
  chord(ImGuiKey_A);
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText() === "edited query",
    "Paste belongs to the active input",
  );
  chord(ImGuiKey_Z);
  chord(ImGuiKey_A);
  chord(ImGuiKey_C);
  expect(
    igGetClipboardText() === "fictional query",
    `Input undo copied ${JSON.stringify(igGetClipboardText())}`,
  );
  const pixels = new Uint8Array(481 * 160 * 4);
  checked(pv_surface_capture(481, 160, pixels));
  checked(
    pv_png_write(process.env.VISUALIZE_NATIVE_CHECK_OUTPUT, 481, 160, pixels),
  );
  rich.dispose();
} finally {
  pv_surface_close();
}
console.log(
  JSON.stringify({
    ok: true,
    selection:
      "forward, reverse, words, paragraphs, word dragging, shift extension, formatted text, select all, input ownership, paste and undo",
  }),
);
