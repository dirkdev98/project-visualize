import {
  type ImDrawList,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
  ImGuiButtonFlags_EnableNav,
  igCalcTextSize,
  igGetItemRectMax,
  igGetItemRectMin,
  igGetWindowDrawList,
  igInvisibleButton,
  igIsItemActive,
  igIsItemHovered,
  igPopFont,
  igPushFont,
} from "maligator:ffi/visualize";
import type { ArtifactType } from "../model.ts";
import { type Color, fonts, packed, palette } from "./theme.ts";
import { itemTooltip } from "./tooltips.ts";

// Code points in the bundled Lucide font; see assets/icons/sources.json for its version.
const glyphs = {
  artifact: 0xe0c0,
  check: 0xe06c,
  chevronDown: 0xe06d,
  chevronRight: 0xe06f,
  close: 0xe1b2,
  context: 0xe431,
  copy: 0xe225,
  dashboard: 0xe1c1,
  diagram: 0xe425,
  document: 0xe0cc,
  fit: 0xe112,
  image: 0xe0f6,
  minus: 0xe11c,
  pdf: 0xe318,
  plus: 0xe13d,
  reset: 0xe148,
};
export type Icon = keyof typeof glyphs;

export function artifactIcon(type: ArtifactType | undefined): Icon {
  return type ?? "artifact";
}

export function drawIcon(
  draw: ImDrawList,
  icon: Icon,
  center: { x: number; y: number },
  size: number,
  tint: Color,
) {
  const face = fonts.icons;
  if (!face) throw new Error("Fonts are not initialized");
  const glyph = String.fromCodePoint(glyphs[icon]);
  igPushFont(face, size);
  const extent = igCalcTextSize(glyph, false, -1);
  igPopFont();
  ImDrawList_AddText_FontPtr(
    draw,
    face,
    size,
    {
      x: Math.round(center.x - extent.x / 2),
      y: Math.round(center.y - extent.y / 2),
    },
    packed(tint),
    glyph,
    0,
  );
}

export function iconButton(
  id: string,
  icon: Icon,
  hint: string,
  options: { active?: boolean; size?: number; iconSize?: number } = {},
): boolean {
  const size = options.size ?? 28;
  const clicked = igInvisibleButton(
    id,
    { x: size, y: size },
    ImGuiButtonFlags_EnableNav,
  );
  const hovered = igIsItemHovered(0),
    held = igIsItemActive();
  const min = igGetItemRectMin(),
    max = igGetItemRectMax();
  const draw = igGetWindowDrawList();
  if (!draw) throw new Error("Cannot access the button canvas");
  if (hovered || held || options.active)
    ImDrawList_AddRectFilled(
      draw,
      min,
      max,
      packed({ ...palette.ink, w: held ? 0.14 : hovered ? 0.08 : 0.06 }),
      7,
      0,
    );
  drawIcon(
    draw,
    icon,
    { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 },
    options.iconSize ?? 16,
    hovered || held || options.active ? palette.ink : palette.muted,
  );
  const split = hint.indexOf(" · ");
  itemTooltip(
    split < 0
      ? hint
      : { title: hint.slice(0, split), shortcut: hint.slice(split + 3) },
  );
  return clicked;
}
