import type { ImageFit } from "../model.ts";

export function layoutImage(
  naturalWidth: number,
  naturalHeight: number,
  availableWidth: number,
  frameHeight?: number,
  fit: ImageFit = "contain",
) {
  const width =
    frameHeight === undefined
      ? Math.min(Math.max(1, availableWidth), naturalWidth)
      : Math.max(1, availableWidth);
  const height = frameHeight ?? (width * naturalHeight) / naturalWidth;
  let image = { x: 0, y: 0, width, height };
  const uv0 = { x: 0, y: 0 },
    uv1 = { x: 1, y: 1 };
  if (fit === "contain") {
    const scale = Math.min(width / naturalWidth, height / naturalHeight);
    const w = naturalWidth * scale,
      h = naturalHeight * scale;
    image = { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
  } else {
    const scale = Math.max(width / naturalWidth, height / naturalHeight);
    const u = width / (naturalWidth * scale),
      v = height / (naturalHeight * scale);
    uv0.x = (1 - u) / 2;
    uv0.y = (1 - v) / 2;
    uv1.x = 1 - uv0.x;
    uv1.y = 1 - uv0.y;
  }
  // The pinned ImGui path builder subtracts one unit after clamping its radius.
  const rounding = Math.max(0, Math.min(10, (Math.min(width, height) - 2) / 2));
  return { width, height, image, uv0, uv1, rounding };
}
