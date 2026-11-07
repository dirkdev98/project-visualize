import {
  ImGuiIO_AddMouseButtonEvent,
  ImGuiIO_AddMousePosEvent,
  ImGuiSliderFlags_AlwaysClamp,
  ImGuiSortDirection_Ascending,
  ImGuiSortDirection_Descending,
  ImGuiTableFlags_Sortable,
  ImGuiTableFlags_SortMulti,
  ImGuiWindowFlags_NoDecoration,
  igBegin,
  igBeginTable,
  igEnd,
  igEndTable,
  igGetIO_Nil,
  igGetItemRectMax,
  igGetItemRectMin,
  igRender,
  igSetNextWindowPos,
  igSetNextWindowSize,
  igSliderDouble,
  igTableGetSortSpecs,
  igTableHeadersRow,
  igTableNextColumn,
  igTableNextRow,
  igTableSetColumnSortDirection,
  igTableSetupColumn,
  pv_png_write,
  pv_surface_begin,
  pv_surface_capture,
  pv_surface_close,
  pv_surface_open,
} from "maligator:ffi/visualize";
import { checked } from "../../src/ui/primitives.ts";
import { initializeTheme, popTheme, pushTheme } from "../../src/ui/theme.ts";

function expect(value, message) {
  if (!value) throw new Error(message);
}
checked(pv_surface_open(0));
try {
  initializeTheme("light");
  const io = igGetIO_Nil();
  let mode = "table",
    slider = 1.25,
    bounds,
    snapshot;
  const expected = [
    { ColumnIndex: 1, SortDirection: ImGuiSortDirection_Descending },
    { ColumnIndex: 0, SortDirection: ImGuiSortDirection_Ascending },
  ];
  function frame() {
    checked(pv_surface_begin(481, 160, 1));
    pushTheme();
    igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
    igSetNextWindowSize({ x: 481, y: 160 }, 0);
    igBegin("Direct library facts", ImGuiWindowFlags_NoDecoration);
    if (
      mode === "table" &&
      igBeginTable(
        "sort",
        2,
        ImGuiTableFlags_Sortable | ImGuiTableFlags_SortMulti,
        { x: 0, y: 0 },
        0,
      )
    ) {
      igTableSetupColumn("Station", 0, 0, 0);
      igTableSetupColumn("Reading", 0, 0, 0);
      igTableHeadersRow();
      igTableNextRow(0, 0);
      igTableNextColumn();
      igTableSetColumnSortDirection(1, ImGuiSortDirection_Descending, false);
      const first = igTableGetSortSpecs()?.Specs ?? [];
      expect(
        first.length === 1 && first[0].ColumnIndex === 1,
        "Sort record did not identify the requested column",
      );
      igTableSetColumnSortDirection(0, ImGuiSortDirection_Ascending, true);
      const second = igTableGetSortSpecs()?.Specs ?? [];
      expect(
        second.length === expected.length,
        "Counted sort records did not include both columns",
      );
      expect(
        second.every(
          (record, i) =>
            record.ColumnIndex === expected[i].ColumnIndex &&
            record.SortDirection === expected[i].SortDirection,
        ),
        "Sort record fields changed their C values",
      );
      expect(
        first.length === 1 &&
          first[0].SortDirection === ImGuiSortDirection_Descending,
        "A copied sort array changed after another native read",
      );
      snapshot = second;
      igEndTable();
    } else if (mode === "slider") {
      const result = igSliderDouble(
        "Reading",
        slider,
        -2.5,
        8.75,
        "%.6g",
        ImGuiSliderFlags_AlwaysClamp,
      );
      slider = result.p_data;
      expect(
        result.p_min === -2.5 && result.p_max === 8.75,
        "Scalar bounds lost double precision or constness",
      );
      bounds = { min: igGetItemRectMin(), max: igGetItemRectMax() };
    }
    igEnd();
    popTheme();
    igRender();
  }
  frame();
  frame();
  expect(
    snapshot.length === expected.length,
    "Native table did not expose sort records",
  );
  mode = "slider";
  frame();
  frame();
  ImGuiIO_AddMousePosEvent(
    io,
    bounds.min.x + 6,
    (bounds.min.y + bounds.max.y) / 2,
  );
  frame();
  ImGuiIO_AddMouseButtonEvent(io, 0, true);
  frame();
  ImGuiIO_AddMouseButtonEvent(io, 0, false);
  frame();
  expect(
    slider === -2.5,
    `Direct double slider returned ${slider} at its minimum`,
  );
  const pixels = new Uint8Array(481 * 160 * 4);
  checked(pv_surface_capture(481, 160, pixels));
  checked(
    pv_png_write(process.env.VISUALIZE_NATIVE_CHECK_OUTPUT, 481, 160, pixels),
  );
} finally {
  pv_surface_close();
}
console.log(
  JSON.stringify({
    ok: true,
    bindings: "counted sort snapshots and const double slider bounds",
  }),
);
