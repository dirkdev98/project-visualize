export function histogram(groups: number[][], count?: number) {
  let min = Infinity,
    max = -Infinity,
    size = 0;
  for (const values of groups)
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
      size++;
    }
  if (!size)
    return {
      boundaries: [] as number[],
      counts: groups.map(() => [] as number[]),
    };
  if (min === max) {
    const padding = Math.max(0.5, Math.abs(min) * 0.05);
    min -= padding;
    max += padding;
  }
  const bins = count ?? Math.max(1, Math.min(50, Math.ceil(Math.sqrt(size))));
  const width = (max - min) / bins;
  const boundaries = Array.from({ length: bins + 1 }, (_, i) =>
    i === bins ? max : min + i * width,
  );
  const counts = groups.map((values) => {
    const result = new Array<number>(bins).fill(0);
    for (const value of values)
      result[
        Math.min(bins - 1, Math.max(0, Math.floor((value - min) / width)))
      ]++;
    return result;
  });
  return { boundaries, counts };
}

export function boxplot(input: number[]) {
  const values = [...input].sort((a, b) => a - b);
  if (!values.length) return undefined;
  const quantile = (p: number) => {
    const index = (values.length - 1) * p,
      lower = Math.floor(index),
      fraction = index - lower;
    return values[lower] * (1 - fraction) + values[Math.ceil(index)] * fraction;
  };
  const q1 = quantile(0.25),
    median = quantile(0.5),
    q3 = quantile(0.75),
    iqr = q3 - q1;
  const low = values.find((value) => value >= q1 - iqr * 1.5) ?? values[0];
  const high =
    [...values].reverse().find((value) => value <= q3 + iqr * 1.5) ??
    values[values.length - 1];
  return {
    q1,
    median,
    q3,
    low,
    high,
    outliers: values.filter((value) => value < low || value > high),
    count: values.length,
  };
}

export function waterfall(
  steps: { value: number; kind?: "delta" | "total" }[],
) {
  let total = 0;
  return steps.map((step) => {
    const start = step.kind === "total" ? 0 : total;
    total = step.kind === "total" ? step.value : total + step.value;
    return { start, end: total };
  });
}
