import {
  type ImDrawList,
  ImPlot_GetPlotDrawList,
  igGetWindowDrawList,
} from "maligator:ffi/visualize";

export function windowDrawList(): ImDrawList {
  const list = igGetWindowDrawList();
  if (!list) throw new Error("Cannot access the drawing canvas");
  return list;
}

export function plotDrawList(): ImDrawList {
  const list = ImPlot_GetPlotDrawList();
  if (!list) throw new Error("Cannot access the drawing canvas");
  return list;
}
