export function crowdedCategories(
  widths: readonly number[],
  plotWidth: number,
) {
  if (!widths.length) return false;
  const spacing = Math.max(1, plotWidth) / (widths.length + 1);
  if (widths.length === 1) return widths[0] > plotWidth;
  return widths.some(
    (width, i) => i > 0 && (widths[i - 1] + width) / 2 + 12 > spacing,
  );
}
