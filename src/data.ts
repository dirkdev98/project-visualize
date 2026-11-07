import {
  type Aggregate,
  type AllParameter,
  type Artifact,
  type Block,
  type Cell,
  type ControlBlock,
  type DataRow,
  type ParameterValue,
  type Series,
  validateParameter,
} from "./model.ts";

export const ALL: AllParameter = Object.freeze({ all: true });
export type Parameters = Map<string, ParameterValue>;
export interface ResolvedView {
  body: Block[];
  datasets: Record<string, DataRow[]>;
  parameters: Record<string, ParameterValue>;
  chartFitKeys: Map<string, string>;
  chartSelections: Map<string, { control: string; values: Cell[] }>;
}
export function dataCell(row: DataRow, key: string): Cell {
  return Object.hasOwn(row, key) ? row[key] : null;
}
export function isAll(value: ParameterValue): value is AllParameter {
  return value !== null && typeof value === "object" && "all" in value;
}
export function controls(document: Artifact): ControlBlock[] {
  const found: ControlBlock[] = [];
  function visit(blocks: Block[]) {
    for (const block of blocks) {
      if (block.type === "control") found.push(block);
      if ("children" in block) visit(block.children);
    }
  }
  visit(document.body);
  return found;
}
export function parameterValue(
  parameters: Parameters,
  id: string,
): ParameterValue {
  const value = parameters.get(id);
  return value === undefined ? ALL : value;
}
export function createParameters(
  document: Artifact,
  overrides?: unknown,
): Parameters {
  const definitions = controls(document);
  const result: Parameters = new Map();
  for (const control of definitions)
    result.set(
      control.id,
      control.default === undefined
        ? control.kind === "toggle"
          ? false
          : control.kind === "search"
            ? ""
            : ALL
        : control.default,
    );
  if (overrides !== undefined) {
    if (
      overrides === null ||
      typeof overrides !== "object" ||
      Array.isArray(overrides)
    )
      throw new Error("params: expected an object keyed by control ID");
    for (const [id, value] of Object.entries(overrides)) {
      const control = definitions.find((control) => control.id === id);
      if (!control) throw new Error(`params.${id}: unknown control ID`);
      result.set(id, validateParameter(control, value));
    }
  }
  return result;
}
function key(value: Cell): string {
  return JSON.stringify([typeof value, value]);
}
function label(value: Cell): string {
  return value === null ? "Empty" : value === "" ? "Empty text" : String(value);
}
export function labels(values: Cell[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values)
    counts.set(label(value), (counts.get(label(value)) ?? 0) + 1);
  return values.map((value) =>
    counts.get(label(value)) === 1
      ? label(value)
      : `${label(value)} (${value === null ? "null" : typeof value})`,
  );
}
function datasetRows(document: Artifact, name: string): DataRow[] {
  return document.datasets && Object.hasOwn(document.datasets, name)
    ? document.datasets[name]
    : [];
}
export function choices(document: Artifact, control: ControlBlock): Cell[] {
  const values = new Map<string, Cell>();
  for (const row of datasetRows(document, control.dataset)) {
    const value = dataCell(row, control.field);
    values.set(key(value), value);
  }
  return [...values.values()];
}
export function numericBounds(
  document: Artifact,
  control: ControlBlock,
): { min: number; max: number } {
  const values = datasetRows(document, control.dataset)
    .map((row) => dataCell(row, control.field))
    .filter((value): value is number => typeof value === "number");
  let min = control.min ?? (values.length ? Math.min(...values) : 0);
  let max =
    control.max ?? (values.length ? Math.max(...values) : Math.max(1, min));
  if (min > max) {
    if (control.min !== undefined) max = min;
    else min = max;
  }
  return { min, max };
}
function matches(
  row: DataRow,
  control: ControlBlock,
  value: ParameterValue,
): boolean {
  if (isAll(value)) return true;
  const cell = dataCell(row, control.field);
  switch (control.kind) {
    case "select":
      return cell === value;
    case "search":
      return (
        !value ||
        String(cell ?? "")
          .toLowerCase()
          .includes(String(value).toLowerCase())
      );
    case "toggle":
      return value !== true || cell === true;
    case "range": {
      if (value === null || typeof value !== "object") return true;
      return (
        typeof cell === "number" &&
        (value.min === undefined || cell >= value.min) &&
        (value.max === undefined || cell <= value.max)
      );
    }
  }
}
function aggregate(
  rows: DataRow[],
  field: string | undefined,
  kind: Aggregate,
): number | null {
  if (kind === "count") return rows.length;
  const values = rows
    .map((row) => (field ? dataCell(row, field) : null))
    .filter((value): value is number => typeof value === "number");
  if (!values.length) return kind === "sum" ? 0 : null;
  if (kind === "min") return Math.min(...values);
  if (kind === "max") return Math.max(...values);
  const sum = values.reduce((total, value) => total + value, 0);
  return kind === "mean" ? sum / values.length : sum;
}
function chart(
  block: Extract<Block, { type: "chart" }>,
  rows: DataRow[],
): { block: Block; values: Cell[] } {
  const source = block.source;
  if (!source) return { block, values: [] };
  const kind = source.aggregate ?? (block.kind === "bar" ? "sum" : undefined);
  const points =
    kind === "count"
      ? rows
      : rows.filter(
          (row) =>
            source.y !== undefined &&
            typeof dataCell(row, source.y) === "number",
        );
  const xs = new Map<string, Cell>();
  for (const row of points) {
    const x = dataCell(row, source.x);
    xs.set(key(x), x);
  }
  const xValues = [...xs.values()];
  const numeric =
    !block.select && xValues.every((value) => typeof value === "number");
  const indices = new Map([...xs.keys()].map((name, i) => [name, i]));
  const groups = new Map<string, { name: Cell; rows: DataRow[] }>();
  for (const row of points) {
    const name = source.series
      ? dataCell(row, source.series)
      : (block.yLabel ?? source.y ?? "Rows");
    let group = groups.get(key(name));
    if (!group) {
      group = { name, rows: [] };
      groups.set(key(name), group);
    }
    group.rows.push(row);
  }
  const names = labels([...groups.values()].map((group) => group.name));
  const series: Series[] = [];
  let index = 0;
  for (const group of groups.values()) {
    const x: number[] = [],
      values: number[] = [];
    if (kind) {
      const buckets = new Map<string, { value: Cell; rows: DataRow[] }>();
      for (const row of group.rows) {
        const value = dataCell(row, source.x);
        let bucket = buckets.get(key(value));
        if (!bucket) {
          bucket = { value, rows: [] };
          buckets.set(key(value), bucket);
        }
        bucket.rows.push(row);
      }
      for (const bucket of buckets.values()) {
        const value = aggregate(bucket.rows, source.y, kind);
        if (value === null) continue;
        x.push(
          numeric
            ? Number(bucket.value)
            : (indices.get(key(bucket.value)) ?? 0),
        );
        values.push(value);
      }
    } else
      for (const row of group.rows) {
        const value = dataCell(row, source.y ?? "");
        if (typeof value !== "number") continue;
        const coordinate = dataCell(row, source.x);
        x.push(
          numeric ? Number(coordinate) : (indices.get(key(coordinate)) ?? 0),
        );
        values.push(value);
      }
    if (values.length) series.push({ name: names[index], values, x });
    index++;
  }
  const { source: _, ...rest } = block;
  return {
    values: xValues,
    block: {
      ...rest,
      series,
      ...(numeric ? {} : { labels: labels(xValues) }),
      xLabel: block.xLabel ?? source.x,
      yLabel: block.yLabel ?? source.y ?? "Rows",
    },
  };
}
function heatmap(
  block: Extract<Block, { type: "heatmap" }>,
  original: DataRow[],
  selected: DataRow[],
): Block {
  let x = block.x ?? [],
    y = block.y ?? [],
    values = block.values ?? [];
  let reference = values;
  const source = block.source;
  if (source) {
    const xs = new Map<string, Cell>(),
      ys = new Map<string, Cell>();
    for (const row of original) {
      const column = dataCell(row, source.x),
        group = dataCell(row, source.y);
      xs.set(key(column), column);
      ys.set(key(group), group);
    }
    x = [...xs.values()];
    y = [...ys.values()];
    const columns = new Map([...xs.keys()].map((name, i) => [name, i]));
    const groups = new Map([...ys.keys()].map((name, i) => [name, i]));
    const xField = source.x,
      yField = source.y,
      measure = source.field;
    const kind = source.aggregate ?? "mean";
    function matrix(rows: DataRow[]): (number | null)[][] {
      const buckets = new Map<number, DataRow[]>();
      for (const row of rows) {
        if (
          kind !== "count" &&
          (measure === undefined || typeof dataCell(row, measure) !== "number")
        )
          continue;
        const column = columns.get(key(dataCell(row, xField))),
          group = groups.get(key(dataCell(row, yField)));
        if (column === undefined || group === undefined) continue;
        const index = group * x.length + column;
        let bucket = buckets.get(index);
        if (!bucket) {
          bucket = [];
          buckets.set(index, bucket);
        }
        bucket.push(row);
      }
      return y.map((_, group) =>
        x.map((_, column) => {
          const bucket = buckets.get(group * x.length + column);
          return bucket ? aggregate(bucket, measure, kind) : null;
        }),
      );
    }
    reference = matrix(original);
    values = selected === original ? reference : matrix(selected);
  }
  const observed = reference
    .flat()
    .filter((value): value is number => value !== null);
  const { source: _, ...rest } = block;
  return {
    ...rest,
    x,
    y,
    values,
    xLabel: block.xLabel ?? source?.x,
    yLabel: block.yLabel ?? source?.y,
    min: block.min ?? (observed.length ? Math.min(...observed) : 0),
    max: block.max ?? (observed.length ? Math.max(...observed) : 0),
  };
}
export function resolveView(
  document: Artifact,
  parameters: Parameters,
): ResolvedView {
  const definitions = controls(document);
  const datasets: Record<string, DataRow[]> = Object.create(null);
  function filteredRows(name: string, except?: string): DataRow[] {
    const source = datasetRows(document, name);
    const filters = definitions.filter(
      (control) => control.dataset === name && control.id !== except,
    );
    return filters.length
      ? source.filter((row) =>
          filters.every((control) =>
            matches(row, control, parameterValue(parameters, control.id)),
          ),
        )
      : source;
  }
  for (const name of Object.keys(document.datasets ?? {}))
    datasets[name] = filteredRows(name);
  function rows(name: string): DataRow[] {
    if (!Object.hasOwn(datasets, name))
      throw new Error(`Unknown dataset: ${name}`);
    return datasets[name];
  }
  const chartFitKeys: ResolvedView["chartFitKeys"] = new Map();
  const chartSelections: ResolvedView["chartSelections"] = new Map();
  function blocks(input: Block[], parent: string): Block[] {
    return input.map((block, index) => {
      const path = `${parent}.${block.id ?? index}`;
      if ("children" in block)
        return { ...block, children: blocks(block.children, path) };
      if (block.type === "table" && block.dataset !== undefined) {
        const { dataset, ...rest } = block;
        return { ...rest, rows: rows(dataset) };
      }
      if (block.type === "metric" && block.source) {
        const { source, ...rest } = block;
        return {
          ...rest,
          value:
            aggregate(rows(source.dataset), source.field, source.aggregate) ??
            "N/A",
        };
      }
      if (block.type === "heatmap")
        return heatmap(
          block,
          block.source ? datasetRows(document, block.source.dataset) : [],
          block.source ? rows(block.source.dataset) : [],
        );
      if (
        (block.type === "histogram" || block.type === "boxplot") &&
        block.source
      ) {
        const { source, ...rest } = block;
        const groups = new Map<string, { name: Cell; values: number[] }>();
        for (const row of rows(source.dataset)) {
          const value = dataCell(row, source.field);
          if (typeof value !== "number") continue;
          const name = source.series
            ? dataCell(row, source.series)
            : source.field;
          let group = groups.get(key(name));
          if (!group) {
            group = { name, values: [] };
            groups.set(key(name), group);
          }
          group.values.push(value);
        }
        const names = labels([...groups.values()].map((group) => group.name));
        return {
          ...rest,
          series: [...groups.values()].map((group, i) => ({
            name: names[i],
            values: group.values,
          })),
        };
      }
      if (block.type === "chart" && block.source) {
        const dataset = block.source.dataset;
        chartFitKeys.set(
          path,
          JSON.stringify(
            definitions
              .filter(
                (control) =>
                  control.dataset === dataset && control.id !== block.select,
              )
              .map((control) => [
                control.id,
                parameterValue(parameters, control.id),
              ]),
          ),
        );
        const comparison =
          block.select && !isAll(parameterValue(parameters, block.select))
            ? filteredRows(dataset, block.select)
            : rows(dataset);
        const prepared = chart(block, comparison);
        if (block.select)
          chartSelections.set(path, {
            control: block.select,
            values: prepared.values,
          });
        return prepared.block;
      }
      return block;
    });
  }
  return {
    body: blocks(document.body, "body"),
    datasets,
    parameters: Object.fromEntries(parameters),
    chartFitKeys,
    chartSelections,
  };
}
