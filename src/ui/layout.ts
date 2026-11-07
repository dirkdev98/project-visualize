export interface VerticalRange {
  top: number;
  bottom: number;
}
export interface LayoutCapture {
  regions: VerticalRange[];
  text: TextFragment[];
  metrics: Map<string, number>;
}
export interface TextFragment {
  value: string;
  font: "regular" | "bold" | "italic" | "mono";
  size: number;
  x: number;
  y: number;
  baseline: number;
  width: number;
  link?: string;
}
let active: LayoutCapture | undefined;
export function captureLayout(draw: () => void): LayoutCapture {
  const capture: LayoutCapture = { regions: [], text: [], metrics: new Map() };
  const previous = active;
  active = capture;
  try {
    draw();
    return capture;
  } finally {
    active = previous;
  }
}
export function currentCapture(): LayoutCapture | undefined {
  return active;
}
export function keepTogether(top: number, bottom: number) {
  if (active && bottom > top) active.regions.push({ top, bottom });
}
export function paginate(
  height: number,
  capacity: number,
  regions: VerticalRange[],
): VerticalRange[] {
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(capacity) ||
    !(height > 0) ||
    !(capacity > 0)
  )
    throw new Error("Page dimensions must be positive");
  const protectedRegions = regions.filter(
    (region) => region.bottom - region.top <= capacity,
  );
  const pages: VerticalRange[] = [];
  let top = 0;
  while (top < height) {
    let bottom = Math.min(height, top + capacity);
    if (bottom < height) {
      let previous: number;
      do {
        previous = bottom;
        for (const region of protectedRegions)
          if (region.top > top && region.top < bottom && region.bottom > bottom)
            bottom = region.top;
      } while (bottom < previous);
    }
    pages.push({ top, bottom });
    top = bottom;
  }
  return pages;
}
