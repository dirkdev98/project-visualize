import {
  type ImDrawList,
  ImPlot_GetPlotDrawList,
  igGetWindowDrawList,
} from "maligator:ffi/visualize";

// Maligator interns C handles by pointer in a weak table and drops a collected handle
// from it only when the incremental sweep finalizes the cell. A lookup before then
// returns the condemned handle, and the sweep closes it while a caller still draws with
// it. ImGui keeps every window's draw list for the whole session, so holding each one
// costs an entry per window and keeps these handles out of the collector's reach.
// https://github.com/dirkdev98/maligator/issues/102
const retained = new Set<ImDrawList>();

function retain(list: ImDrawList | null): ImDrawList {
  if (!list) throw new Error("Cannot access the drawing canvas");
  retained.add(list);
  return list;
}

export function windowDrawList(): ImDrawList {
  return retain(igGetWindowDrawList());
}

export function plotDrawList(): ImDrawList {
  return retain(ImPlot_GetPlotDrawList());
}
