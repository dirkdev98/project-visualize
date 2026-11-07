export interface VerticalRange {
  top: number;
  bottom: number;
}
export interface TableCapture {
  left: number;
  right: number;
  header: VerticalRange;
  rows: VerticalRange[];
  headerText: TextFragment[];
}
export interface LayoutCapture {
  breaks: number[];
  regions: VerticalRange[];
  lines: VerticalRange[];
  tables: TableCapture[];
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
  const capture: LayoutCapture = {
    breaks: [],
    regions: [],
    lines: [],
    tables: [],
    text: [],
    metrics: new Map(),
  };
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
export function keepLineTogether(top: number, bottom: number) {
  if (active && bottom > top) active.lines.push({ top, bottom });
}
// Sample row starts before entering a cell, whose cursor includes cell padding.
export function captureTable(
  left: number,
  right: number,
  top: number,
  bottom: number,
  rowStarts: number[],
  textStart: number,
  textEnd: number,
) {
  if (!active || !rowStarts.length) return;
  const rows = rowStarts.map((start, i) => ({
    top: start,
    bottom: rowStarts[i + 1] ?? bottom,
  }));
  active.tables.push({
    left,
    right,
    header: { top, bottom: rowStarts[0] },
    rows,
    headerText: active.text.slice(textStart, textEnd),
  });
  keepTogether(top, rows[0].bottom);
  const firstLine = active.text[textEnd];
  if (firstLine) keepTogether(top, firstLine.y + firstLine.size);
}
export function pageBottom(
  top: number,
  height: number,
  capacity: number,
  regions: VerticalRange[],
  lines: VerticalRange[] = [],
): number {
  const target = Math.min(height, top + capacity);
  if (target === height) return height;
  const fits = (region: VerticalRange) =>
    region.bottom - region.top <= capacity;
  function cut(ranges: VerticalRange[]): number {
    let bottom = target;
    let previous: number;
    do {
      previous = bottom;
      for (const range of ranges)
        if (range.top < bottom && range.bottom > bottom) bottom = range.top;
    } while (bottom > top && bottom < previous);
    return bottom;
  }
  let bottom = cut([...regions.filter(fits), ...lines]);
  // Independent columns can leave no break between complete rows. Preserve text first.
  if (bottom <= top) bottom = cut(lines);
  if (bottom <= top)
    throw new Error(
      "No safe PDF page break; stack columns vertically or shorten the section",
    );
  return bottom;
}
