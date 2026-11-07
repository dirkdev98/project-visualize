import {
  ImDrawList_AddRectFilled,
  ImDrawList_GetClipRectMax,
  ImDrawList_GetClipRectMin,
  ImGuiKey_A,
  ImGuiKey_C,
  ImGuiKey_Escape,
  ImGuiMod_Ctrl,
  ImGuiMouseCursor_TextInput,
  igCalcTextSize,
  igGetActiveID,
  igGetMousePos,
  igGetScrollY,
  igGetWindowDrawList,
  igIsKeyPressed_Bool,
  igIsMouseClicked_Bool,
  igIsMouseDoubleClicked_Nil,
  igIsMouseDown_Nil,
  igIsMouseDragging,
  igIsWindowFocused,
  igIsWindowHovered,
  igPopClipRect,
  igPopFont,
  igPushClipRect,
  igPushFont,
  igSetClipboardText,
  igSetMouseCursor,
  igSetScrollY_Float,
  igShortcut_Nil,
} from "maligator:ffi/visualize";
import { type Font, fonts, packed, palette } from "./theme.ts";

interface Point {
  x: number;
  y: number;
}
interface Fragment {
  value: string;
  start: number;
  point: Point;
  width: number;
  size: number;
  font: Font;
  clipMin: Point;
  clipMax: Point;
}
let current: TextSelection | undefined;

export function selectionText(
  value: string,
  font: Font,
  size: number,
  point: Point,
  width: number,
) {
  current?.add(value, font, size, point, width);
}
export function selectionBreak(value = "\n") {
  current?.append(value);
}
export function selectingText() {
  return current !== undefined;
}
export function draggingText() {
  return current?.dragging ?? false;
}
export function withoutTextSelection(body: () => void) {
  const previous = current;
  current = undefined;
  try {
    body();
  } finally {
    current = previous;
  }
}
export function withTextSelection(selection: TextSelection, body: () => void) {
  selection.begin();
  current = selection;
  try {
    body();
    selection.end();
  } finally {
    current = undefined;
  }
}

export class TextSelection {
  private fragments: Fragment[] = [];
  private content = "";
  private previous = "";
  private anchor = 0;
  private focus = 0;
  private pressed = false;
  private moved = false;
  private hovered = false;
  get dragging() {
    return this.pressed && (this.moved || igIsMouseDragging(0, -1));
  }
  begin() {
    this.fragments = [];
    this.content = "";
    this.hovered = igIsWindowHovered(0);
  }
  append(value: string) {
    this.content += value;
  }
  add(value: string, font: Font, size: number, point: Point, width: number) {
    const draw = igGetWindowDrawList();
    if (!draw) return;
    this.fragments.push({
      value,
      start: this.content.length,
      font,
      size,
      point,
      width,
      clipMin: ImDrawList_GetClipRectMin(draw),
      clipMax: ImDrawList_GetClipRectMax(draw),
    });
    this.content += value;
  }
  private offset(fragment: Fragment, x: number) {
    const face = fonts[fragment.font];
    if (!face) throw new Error("Fonts are not initialized");
    igPushFont(face, fragment.size);
    try {
      const points = Array.from(fragment.value);
      let low = 0,
        high = points.length;
      const width = (count: number) =>
        igCalcTextSize(points.slice(0, count).join(""), false, -1).x;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const boundary = (width(mid) + width(mid + 1)) / 2;
        if (x < boundary) high = mid;
        else low = mid + 1;
      }
      return fragment.start + points.slice(0, low).join("").length;
    } finally {
      igPopFont();
    }
  }
  end() {
    if (this.previous !== this.content) {
      this.anchor = this.focus = 0;
      this.pressed = false;
      this.previous = this.content;
    }
    const mouse = igGetMousePos();
    let hit: Fragment | undefined,
      nearest: Fragment | undefined,
      distance = Infinity;
    for (const fragment of this.fragments) {
      const { point, size, width, clipMin, clipMax } = fragment;
      if (point.y + size < clipMin.y || point.y > clipMax.y || width <= 0)
        continue;
      const dx = Math.max(point.x - mouse.x, mouse.x - point.x - width, 0);
      const dy = Math.max(point.y - mouse.y, mouse.y - point.y - size, 0);
      const d = dy * 1_000_000 + dx;
      if (d < distance) {
        distance = d;
        nearest = fragment;
      }
      if (
        dx === 0 &&
        dy === 0 &&
        mouse.x >= clipMin.x &&
        mouse.x <= clipMax.x &&
        mouse.y >= clipMin.y &&
        mouse.y <= clipMax.y
      )
        hit = fragment;
    }
    if (this.hovered && hit) igSetMouseCursor(ImGuiMouseCursor_TextInput);
    if (this.hovered && igIsMouseClicked_Bool(0, false)) {
      this.pressed = hit !== undefined;
      this.moved = false;
      this.anchor = this.focus = hit
        ? this.offset(hit, mouse.x - hit.point.x)
        : 0;
      if (hit && igIsMouseDoubleClicked_Nil(0)) {
        const points = Array.from(this.content);
        let index = 0,
          count = 0;
        while (index < points.length && count < this.focus)
          count += points[index++].length;
        let start = index,
          end = index;
        const word = (value: string) => /[\p{L}\p{N}_]/u.test(value);
        while (start > 0 && word(points[start - 1])) start--;
        while (end < points.length && word(points[end])) end++;
        this.anchor = points.slice(0, start).join("").length;
        this.focus = points.slice(0, end).join("").length;
        this.pressed = false;
      }
    }
    if (this.dragging && nearest) {
      this.moved = true;
      this.focus = this.offset(nearest, mouse.x - nearest.point.x);
      const draw = igGetWindowDrawList();
      if (draw) {
        const min = ImDrawList_GetClipRectMin(draw),
          max = ImDrawList_GetClipRectMax(draw);
        if (mouse.y < min.y + 12) igSetScrollY_Float(igGetScrollY() - 16);
        if (mouse.y > max.y - 12) igSetScrollY_Float(igGetScrollY() + 16);
      }
    }
    if (!igIsMouseDown_Nil(0)) this.pressed = false;
    if (
      igIsWindowFocused(0) &&
      igGetActiveID() === 0 &&
      this.anchor !== this.focus
    ) {
      const all = igShortcut_Nil(ImGuiMod_Ctrl | ImGuiKey_A, 0);
      if (all) {
        this.anchor = 0;
        this.focus = this.content.length;
      }
      if (igShortcut_Nil(ImGuiMod_Ctrl | ImGuiKey_C, 0))
        igSetClipboardText(
          this.content.slice(
            Math.min(this.anchor, this.focus),
            Math.max(this.anchor, this.focus),
          ),
        );
      if (igIsKeyPressed_Bool(ImGuiKey_Escape, false))
        this.anchor = this.focus = 0;
    }
    const start = Math.min(this.anchor, this.focus),
      end = Math.max(this.anchor, this.focus);
    const draw = igGetWindowDrawList();
    if (!draw || start === end) return;
    for (const fragment of this.fragments) {
      const a = Math.max(0, start - fragment.start),
        b = Math.min(fragment.value.length, end - fragment.start);
      if (a >= b) continue;
      const face = fonts[fragment.font];
      if (!face) continue;
      igPushFont(face, fragment.size);
      const x = (offset: number) =>
        fragment.point.x +
        igCalcTextSize(fragment.value.slice(0, offset), false, -1).x;
      igPushClipRect(fragment.clipMin, fragment.clipMax, true);
      ImDrawList_AddRectFilled(
        draw,
        { x: x(a), y: fragment.point.y },
        { x: x(b), y: fragment.point.y + fragment.size },
        packed({ ...palette.accent, w: 0.25 }),
        2,
        0,
      );
      igPopClipRect();
      igPopFont();
    }
  }
}
