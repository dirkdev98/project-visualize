import {
  ImDrawList_AddRectFilled,
  ImDrawList_GetClipRectMax,
  ImDrawList_GetClipRectMin,
  ImGuiKey_A,
  ImGuiKey_C,
  ImGuiKey_End,
  ImGuiKey_Escape,
  ImGuiKey_Home,
  ImGuiKey_LeftArrow,
  ImGuiKey_RightArrow,
  ImGuiMod_Alt,
  ImGuiMod_Ctrl,
  ImGuiMod_Shift,
  ImGuiMouseCursor_TextInput,
  ImGuiPopupFlags_MouseButtonRight,
  igBeginPopupContextWindow,
  igCalcTextSize,
  igEndPopup,
  igGetActiveID,
  igGetMouseClickedCount,
  igGetMousePos,
  igGetScrollY,
  igIsKeyDown_Nil,
  igIsKeyPressed_Bool,
  igIsMouseClicked_Bool,
  igIsMouseDown_Nil,
  igIsMouseDragging,
  igIsWindowFocused,
  igIsWindowHovered,
  igMenuItem_Bool,
  igPopClipRect,
  igPopFont,
  igPushClipRect,
  igPushFont,
  igSetClipboardText,
  igSetMouseCursor,
  igSetScrollY_Float,
  igShortcut_Nil,
} from "maligator:ffi/visualize";
import { windowDrawList } from "./draw-list.ts";
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
  private unit: "character" | "word" | "paragraph" = "character";
  private origin = { start: 0, end: 0 };
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
    const draw = windowDrawList();
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
  private range(offset: number, unit = this.unit) {
    let start = offset,
      end = offset;
    if (unit === "paragraph") {
      start = this.content.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
      const next = this.content.indexOf("\n", offset);
      end = next < 0 ? this.content.length : next + 1;
    } else if (unit === "word") {
      const points = Array.from(this.content);
      let index = 0,
        count = 0;
      while (index < points.length && count < offset)
        count += points[index++].length;
      let a = index,
        b = index;
      const word = (value: string) => /[\p{L}\p{N}\p{M}_]/u.test(value);
      const match = word(points[index] ?? "")
        ? word
        : (value: string) =>
            !word(value) &&
            value !== "\n" &&
            /\s/u.test(value) === /\s/u.test(points[index] ?? "");
      while (a > 0 && match(points[a - 1])) a--;
      while (b < points.length && match(points[b])) b++;
      start = points.slice(0, a).join("").length;
      end = points.slice(0, b).join("").length;
    }
    return { start, end };
  }
  private copy() {
    igSetClipboardText(
      this.content.slice(
        Math.min(this.anchor, this.focus),
        Math.max(this.anchor, this.focus),
      ),
    );
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
      const offset = hit ? this.offset(hit, mouse.x - hit.point.x) : 0;
      const clicks = igGetMouseClickedCount(0);
      this.unit =
        clicks >= 2 ? (clicks % 2 === 0 ? "word" : "paragraph") : "character";
      if (hit && igIsKeyDown_Nil(ImGuiMod_Shift) && clicks === 1)
        this.focus = offset;
      else {
        this.origin = this.range(offset);
        this.anchor = this.origin.start;
        this.focus = this.origin.end;
      }
    }
    if (this.dragging && nearest) {
      this.moved = true;
      const offset = this.offset(nearest, mouse.x - nearest.point.x);
      const range = this.range(offset);
      if (this.unit === "character") this.focus = offset;
      else if (offset < this.origin.start) {
        this.anchor = this.origin.end;
        this.focus = range.start;
      } else {
        this.anchor = this.origin.start;
        this.focus = range.end;
      }
      const draw = windowDrawList();
      const min = ImDrawList_GetClipRectMin(draw),
        max = ImDrawList_GetClipRectMax(draw);
      if (mouse.y < min.y + 12) igSetScrollY_Float(igGetScrollY() - 16);
      if (mouse.y > max.y - 12) igSetScrollY_Float(igGetScrollY() + 16);
    }
    if (!igIsMouseDown_Nil(0)) this.pressed = false;
    if (igIsWindowFocused(0) && igGetActiveID() === 0) {
      const shift = igIsKeyDown_Nil(ImGuiMod_Shift);
      const command = igIsKeyDown_Nil(ImGuiMod_Ctrl);
      const word =
        process.platform === "darwin" ? igIsKeyDown_Nil(ImGuiMod_Alt) : command;
      const left = igIsKeyPressed_Bool(ImGuiKey_LeftArrow, true),
        right = igIsKeyPressed_Bool(ImGuiKey_RightArrow, true);
      const home = igIsKeyPressed_Bool(ImGuiKey_Home, true),
        end = igIsKeyPressed_Bool(ImGuiKey_End, true);
      if (left || right || home || end) {
        let next = this.focus;
        if (home || end || (process.platform === "darwin" && command)) {
          const range = this.range(this.focus, "paragraph");
          next =
            left || home
              ? range.start
              : Math.max(
                  range.start,
                  range.end - (this.content[range.end - 1] === "\n" ? 1 : 0),
                );
        } else if (!shift && this.anchor !== this.focus)
          next = left
            ? Math.min(this.anchor, this.focus)
            : Math.max(this.anchor, this.focus);
        else if (word) {
          const range = this.range(
            Math.max(0, this.focus - (left ? 1 : 0)),
            "word",
          );
          next = left ? range.start : range.end;
        } else {
          const prefix = Array.from(this.content.slice(0, this.focus));
          next = left
            ? this.focus - (prefix.pop()?.length ?? 0)
            : this.focus +
              (Array.from(this.content.slice(this.focus))[0]?.length ?? 0);
        }
        this.focus = Math.max(0, Math.min(this.content.length, next));
        if (!shift) this.anchor = this.focus;
      }
      const all = igShortcut_Nil(ImGuiMod_Ctrl | ImGuiKey_A, 0);
      if (all) {
        this.anchor = 0;
        this.focus = this.content.length;
      }
      if (
        igShortcut_Nil(ImGuiMod_Ctrl | ImGuiKey_C, 0) &&
        this.anchor !== this.focus
      )
        this.copy();
      if (igIsKeyPressed_Bool(ImGuiKey_Escape, false))
        this.anchor = this.focus = 0;
    }
    if (
      igGetActiveID() === 0 &&
      igBeginPopupContextWindow(
        "document-text",
        ImGuiPopupFlags_MouseButtonRight,
      )
    ) {
      if (
        igMenuItem_Bool(
          "Copy",
          process.platform === "darwin" ? "Cmd+C" : "Ctrl+C",
          false,
          this.anchor !== this.focus,
        )
      )
        this.copy();
      if (
        igMenuItem_Bool(
          "Select all",
          process.platform === "darwin" ? "Cmd+A" : "Ctrl+A",
          false,
          this.content.length > 0,
        )
      ) {
        this.anchor = 0;
        this.focus = this.content.length;
      }
      igEndPopup();
    }
    const start = Math.min(this.anchor, this.focus),
      end = Math.max(this.anchor, this.focus);
    const draw = windowDrawList();
    if (start === end) return;
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
