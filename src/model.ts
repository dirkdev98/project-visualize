export type Tone = "neutral" | "positive" | "warning" | "negative";
export type Cell = string | number | boolean | null;
export type DataRow = Record<string, Cell>;
export type Aggregate = "sum" | "mean" | "count" | "min" | "max";
export interface AllParameter {
  all: true;
}
export type ParameterValue =
  | Cell
  | AllParameter
  | { min?: number; max?: number };
export interface MetricSource {
  dataset: string;
  field?: string;
  aggregate: Aggregate;
}
export interface ChartSource {
  dataset: string;
  x: string;
  y?: string;
  series?: string;
  aggregate?: Aggregate;
}
export interface ControlBlock extends BlockStyle {
  type: "control";
  id: string;
  kind: "select" | "search" | "range" | "toggle";
  label: string;
  dataset: string;
  field: string;
  default?: ParameterValue;
  min?: number;
  max?: number;
}
interface BlockStyle {
  id?: string;
  title?: string;
  caption?: string;
  height?: number;
  tone?: Tone;
}
export interface Series {
  name: string;
  values: number[];
  x?: number[];
}
export interface DiagramNode {
  id: string;
  label: string;
  detail?: string;
  x?: number;
  y?: number;
  tone?: Tone;
}
export type Block = BlockStyle &
  (
    | {
        type: "markdown" | "callout" | "code" | "text";
        content: string;
        language?: string;
      }
    | ({
        type: "metric";
        label: string;
        detail?: string;
        decimals?: number;
        prefix?: string;
        suffix?: string;
      } & (
        | { value: string | number; source?: never }
        | { source: MetricSource; value?: never }
      ))
    | ControlBlock
    | { type: "progress"; label: string; value: number; detail?: string }
    | {
        type: "row" | "column" | "card" | "details";
        children: Block[];
        weights?: number[];
      }
    | ({
        type: "chart";
        kind: "line" | "bar" | "scatter";
        labels?: string[];
        xLabel?: string;
        yLabel?: string;
      } & (
        | { series: Series[]; source?: never }
        | { source: ChartSource; series?: never }
      ))
    | ({
        type: "table";
        columns: { key: string; label: string }[];
      } & (
        | { rows: DataRow[]; dataset?: never }
        | { dataset: string; rows?: never }
      ))
    | {
        type: "diagram";
        nodes: DiagramNode[];
        edges?: { from: string; to: string; label?: string }[];
      }
    | { type: "image"; asset: string }
    | { type: "divider" | "spacer" }
  );

export interface Artifact {
  schemaVersion: 1;
  title: string;
  subtitle?: string;
  category?: string;
  context?: Record<string, unknown>;
  assets?: Record<string, string>;
  datasets?: Record<string, DataRow[]>;
  pdf?: { paper?: "a4" | "letter"; orientation?: "portrait" | "landscape" };
  body: Block[];
}

type ObjectValue = Record<string, unknown>;

function fail(location: string, expected: string): never {
  throw new Error(`${location}: ${expected}`);
}

function object(value: unknown, location: string): ObjectValue {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(location, "expected an object");
  return value as ObjectValue;
}

function string(value: unknown, location: string, max = 200_000): string {
  if (typeof value !== "string" || value.length > max || value.includes("\0"))
    fail(location, `expected text of at most ${max} characters without NUL`);
  return value;
}

function number(value: unknown, location: string, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(location, `expected a finite number from ${min} to ${max}`);
  return value;
}

function array(
  value: unknown,
  location: string,
  min: number,
  max: number,
): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    fail(location, `expected an array with ${min}..${max} items`);
  return value;
}

function scalar(value: unknown, location: string) {
  if (typeof value === "string") string(value, location);
  if (
    value !== null &&
    typeof value !== "boolean" &&
    typeof value !== "string" &&
    !(typeof value === "number" && Number.isFinite(value))
  )
    fail(location, "expected text, a finite number, boolean or null");
}

export function slug(value: string, label: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value))
    throw new Error(
      `${label} must use lowercase letters, digits, underscores or hyphens (1..80 characters)`,
    );
  return value;
}

export function validateParameter(
  control: ControlBlock,
  input: unknown,
  location = `params.${control.id}`,
): ParameterValue {
  if (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    Object.hasOwn(input, "all")
  ) {
    const value = input as Record<string, unknown>;
    if (value.all !== true || Object.keys(value).length !== 1)
      fail(location, "use { all: true } to clear a control");
    return { all: true };
  }
  if (control.kind === "select") {
    scalar(input, location);
    return input as Cell;
  }
  if (control.kind === "search") return string(input, location, 1000);
  if (control.kind === "toggle") {
    if (typeof input !== "boolean") fail(location, "expected a boolean");
    return input;
  }
  const range = object(input, location);
  if (
    !Object.keys(range).length ||
    Object.keys(range).some((key) => key !== "min" && key !== "max")
  )
    fail(location, "expected min and/or max bounds");
  for (const key of ["min", "max"])
    if (range[key] !== undefined)
      number(range[key], `${location}.${key}`, -1e100, 1e100);
  if (
    typeof range.min === "number" &&
    typeof range.max === "number" &&
    range.min > range.max
  )
    fail(location, "minimum exceeds maximum");
  return range as { min?: number; max?: number };
}

export function validate(input: unknown): Artifact {
  const doc = object(input, "artifact");
  if (doc.schemaVersion !== 1) fail("schemaVersion", "expected 1");
  if (!string(doc.title, "title", 240).trim())
    fail("title", "expected a title");
  for (const field of ["subtitle", "category"]) {
    if (doc[field] !== undefined) string(doc[field], field, 1000);
  }
  if (doc.context !== undefined) object(doc.context, "context");
  if (doc.pdf !== undefined) {
    const pdf = object(doc.pdf, "pdf");
    if (pdf.paper !== undefined && pdf.paper !== "a4" && pdf.paper !== "letter")
      fail("pdf.paper", "expected a4 or letter");
    if (
      pdf.orientation !== undefined &&
      pdf.orientation !== "portrait" &&
      pdf.orientation !== "landscape"
    )
      fail("pdf.orientation", "expected portrait or landscape");
  }
  const assets = doc.assets === undefined ? {} : object(doc.assets, "assets");
  for (const [name, source] of Object.entries(assets)) {
    slug(name, "asset name");
    string(source, `assets.${name}`, 4096);
  }
  const datasets =
    doc.datasets === undefined ? {} : object(doc.datasets, "datasets");
  for (const [name, input] of Object.entries(datasets)) {
    slug(name, "dataset name");
    array(input, `datasets.${name}`, 0, 5000).forEach((input, index) => {
      const row = object(input, `datasets.${name}[${index}]`);
      for (const [key, value] of Object.entries(row)) {
        string(key, `datasets.${name}[${index}] field`, 120);
        scalar(value, `datasets.${name}[${index}].${key}`);
      }
    });
  }
  function dataset(name: unknown, location: string): DataRow[] {
    if (typeof name !== "string" || !Object.hasOwn(datasets, name))
      fail(location, "expected a declared dataset name");
    return datasets[name] as DataRow[];
  }
  function dataField(
    rows: DataRow[],
    key: unknown,
    location: string,
    numeric = false,
  ): string {
    const name = string(key, location, 120);
    if (!name || (rows.length && !rows.some((row) => Object.hasOwn(row, name))))
      fail(location, "field is absent from the dataset");
    if (
      numeric &&
      rows.length &&
      !rows.some(
        (row) => Object.hasOwn(row, name) && typeof row[name] === "number",
      )
    )
      fail(location, "expected a numeric field");
    return name;
  }
  function aggregate(value: unknown, location: string) {
    if (!["sum", "mean", "count", "min", "max"].includes(String(value)))
      fail(location, "expected sum, mean, count, min or max");
  }
  const controlIds = new Set<string>();
  let blocks = 0;
  let points = 0;
  function visit(
    input: unknown,
    location: string,
    depth: number,
    siblings: Set<string>,
  ) {
    if (++blocks > 1000 || depth > 12)
      fail(location, "artifact is too deeply nested or has too many blocks");
    const block = object(input, location);
    const field = (key: string) => `${location}.${key}`;
    if (block.id !== undefined) {
      const id = string(block.id, field("id"), 120);
      if (!/^[a-z][a-z0-9_-]{0,79}$/.test(id) || siblings.has(id))
        fail(
          field("id"),
          "expected a unique sibling ID using a lowercase letter followed by letters, digits, hyphens or underscores",
        );
      siblings.add(id);
    }
    for (const key of ["title", "caption", "detail"]) {
      if (block[key] !== undefined) string(block[key], field(key));
    }
    if (
      block.tone !== undefined &&
      !["neutral", "positive", "warning", "negative"].includes(
        String(block.tone),
      )
    )
      fail(field("tone"), "expected neutral, positive, warning or negative");
    if (block.height !== undefined)
      number(block.height, field("height"), 0, 2000);
    switch (block.type) {
      case "markdown":
      case "callout":
      case "code":
      case "text":
        string(block.content, field("content"));
        if (block.language !== undefined)
          string(block.language, field("language"), 80);
        break;
      case "metric": {
        string(block.label, field("label"), 240);
        if (block.decimals !== undefined) {
          number(block.decimals, field("decimals"), 0, 8);
          if (!Number.isInteger(block.decimals))
            fail(field("decimals"), "expected an integer");
        }
        for (const key of ["prefix", "suffix"])
          if (block[key] !== undefined) string(block[key], field(key), 80);
        if ((block.value === undefined) === (block.source === undefined))
          fail(location, "supply either value or source");
        if (block.source !== undefined) {
          const source = object(block.source, field("source"));
          const rows = dataset(source.dataset, field("source.dataset"));
          aggregate(source.aggregate, field("source.aggregate"));
          if (source.aggregate !== "count" || source.field !== undefined)
            dataField(
              rows,
              source.field,
              field("source.field"),
              source.aggregate !== "count",
            );
        } else {
          if (
            typeof block.value !== "string" &&
            typeof block.value !== "number"
          )
            fail(field("value"), "expected text or a number");
          scalar(block.value, field("value"));
        }
        break;
      }
      case "control": {
        if (block.id === undefined || controlIds.has(String(block.id)))
          fail(field("id"), "controls require globally unique IDs");
        controlIds.add(String(block.id));
        if (
          !["select", "search", "range", "toggle"].includes(String(block.kind))
        )
          fail(field("kind"), "expected select, search, range or toggle");
        string(block.label, field("label"), 240);
        const rows = dataset(block.dataset, field("dataset"));
        dataField(rows, block.field, field("field"), block.kind === "range");
        for (const key of ["min", "max"])
          if (block[key] !== undefined)
            number(block[key], field(key), -1e100, 1e100);
        if (
          typeof block.min === "number" &&
          typeof block.max === "number" &&
          block.min > block.max
        )
          fail(location, "minimum exceeds maximum");
        if (block.default !== undefined)
          validateParameter(
            block as unknown as ControlBlock,
            block.default,
            field("default"),
          );
        break;
      }
      case "progress":
        string(block.label, field("label"), 240);
        number(block.value, field("value"), 0, 1);
        break;
      case "row":
      case "column":
      case "card":
      case "details": {
        const children = array(
          block.children,
          field("children"),
          1,
          block.type === "row" ? 6 : 100,
        );
        if (block.type === "details") string(block.title, field("title"), 240);
        if (block.weights !== undefined) {
          const weights = array(
            block.weights,
            field("weights"),
            children.length,
            children.length,
          );
          weights.forEach((weight, index) => {
            number(weight, `${field("weights")}[${index}]`, 0.1, 100);
          });
        }
        const childIds = new Set<string>();
        children.forEach((child, index) => {
          visit(child, `${field("children")}[${index}]`, depth + 1, childIds);
        });
        break;
      }
      case "chart": {
        if (!["line", "bar", "scatter"].includes(String(block.kind)))
          fail(field("kind"), "expected line, bar or scatter");
        if (block.height !== undefined)
          number(block.height, field("height"), 160, 1200);
        for (const key of ["xLabel", "yLabel"])
          if (block[key] !== undefined) string(block[key], field(key), 240);
        if ((block.series === undefined) === (block.source === undefined))
          fail(location, "supply either series or source");
        if (block.source !== undefined) {
          if (block.labels !== undefined)
            fail(
              field("labels"),
              "source charts derive labels from their x field",
            );
          const source = object(block.source, field("source"));
          const rows = dataset(source.dataset, field("source.dataset"));
          const xField = dataField(rows, source.x, field("source.x"));
          const coordinates = rows.map((row) =>
            Object.hasOwn(row, xField) ? row[xField] : null,
          );
          if (coordinates.some((value) => typeof value !== "number")) {
            if (
              new Set(
                coordinates.map((value) =>
                  JSON.stringify([typeof value, value]),
                ),
              ).size > 1000
            )
              fail(field("source.x"), "source exceeds the chart label limit");
            for (const value of coordinates)
              if (typeof value === "string")
                string(value, field("source.x"), 120);
          }
          if (source.aggregate !== undefined)
            aggregate(source.aggregate, field("source.aggregate"));
          if (source.aggregate !== "count" || source.y !== undefined)
            dataField(
              rows,
              source.y,
              field("source.y"),
              source.aggregate !== "count",
            );
          if (source.series !== undefined) {
            const seriesField = dataField(
              rows,
              source.series,
              field("source.series"),
            );
            const names = new Set(
              rows.map((row) =>
                JSON.stringify(
                  Object.hasOwn(row, seriesField) ? row[seriesField] : null,
                ),
              ),
            );
            if (names.size > 12)
              fail(
                field("source.series"),
                "source exceeds the chart series limit",
              );
          }
          points += rows.length;
          if (points > 250_000)
            fail(location, "artifact exceeds the chart point limit");
          break;
        }
        const series = array(block.series, field("series"), 1, 12);
        let labelCount: number | undefined;
        if (block.labels !== undefined) {
          const labels = array(block.labels, field("labels"), 1, 1000);
          labels.forEach((label, index) => {
            string(label, `${field("labels")}[${index}]`, 120);
          });
          labelCount = labels.length;
        }
        const names = new Set<string>();
        series.forEach((input, index) => {
          const itemPath = `${field("series")}[${index}]`;
          const item = object(input, itemPath);
          const name = string(item.name, `${itemPath}.name`, 240);
          if (!name || names.has(name))
            fail(`${itemPath}.name`, "expected a unique nonempty series name");
          names.add(name);
          const values = array(item.values, `${itemPath}.values`, 1, 100_000);
          points += values.length;
          if (points > 250_000)
            fail(location, "artifact exceeds the chart point limit");
          values.forEach((value, i) => {
            number(value, `${itemPath}.values[${i}]`, -1e100, 1e100);
          });
          if (
            labelCount !== undefined &&
            item.x === undefined &&
            values.length !== labelCount
          )
            fail(
              `${itemPath}.values`,
              "each series must have one value per label",
            );
          if (item.x !== undefined) {
            const x = array(
              item.x,
              `${itemPath}.x`,
              values.length,
              values.length,
            );
            x.forEach((value, i) => {
              number(value, `${itemPath}.x[${i}]`, -1e100, 1e100);
            });
          }
        });
        break;
      }
      case "table": {
        const keys = new Set<string>();
        const columns = array(block.columns, field("columns"), 1, 12);
        columns.forEach((input, index) => {
          const column = object(input, `${field("columns")}[${index}]`);
          const key = string(column.key, field("column.key"), 120);
          if (!key || keys.has(key))
            fail(field("columns"), "column keys must be unique and nonempty");
          keys.add(key);
          string(column.label, field("column.label"), 240);
        });
        if ((block.rows === undefined) === (block.dataset === undefined))
          fail(location, "supply either rows or dataset");
        const rows =
          block.dataset === undefined
            ? array(block.rows, field("rows"), 0, 5000)
            : dataset(block.dataset, field("dataset"));
        rows.forEach((input, index) => {
          const row = object(input, `${field("rows")}[${index}]`);
          for (const key of keys)
            if (Object.hasOwn(row, key))
              scalar(row[key], `${field("rows")}[${index}].${key}`);
        });
        break;
      }
      case "diagram": {
        if (block.height !== undefined)
          number(block.height, field("height"), 160, 1600);
        const ids = new Set<string>();
        array(block.nodes, field("nodes"), 1, 60).forEach((input, index) => {
          const node = object(input, `${field("nodes")}[${index}]`);
          const id = string(node.id, field("node.id"), 120);
          if (!id || ids.has(id))
            fail(field("nodes"), "node IDs must be unique and nonempty");
          ids.add(id);
          string(node.label, field("node.label"), 240);
          if (node.detail !== undefined)
            string(node.detail, field("node.detail"));
          if (
            node.tone !== undefined &&
            !["neutral", "positive", "warning", "negative"].includes(
              String(node.tone),
            )
          )
            fail(
              field("node.tone"),
              "expected neutral, positive, warning or negative",
            );
          for (const axis of ["x", "y"])
            if (node[axis] !== undefined)
              number(node[axis], field(`node.${axis}`), 0, 1);
        });
        if (block.edges !== undefined)
          array(block.edges, field("edges"), 0, 150).forEach((input) => {
            const edge = object(input, field("edge"));
            if (!ids.has(String(edge.from)) || !ids.has(String(edge.to)))
              fail(
                field("edges"),
                "edge endpoints must name existing node IDs",
              );
            if (edge.label !== undefined)
              string(edge.label, field("edge.label"), 240);
          });
        break;
      }
      case "image":
        if (
          typeof block.asset !== "string" ||
          !Object.hasOwn(assets, block.asset)
        )
          fail(field("asset"), "expected a declared asset name");
        break;
      case "divider":
      case "spacer":
        break;
      default:
        fail(field("type"), `unsupported block type ${String(block.type)}`);
    }
  }
  const bodyIds = new Set<string>();
  array(doc.body, "body", 1, 100).forEach((block, index) => {
    visit(block, `body[${index}]`, 0, bodyIds);
  });
  return doc as unknown as Artifact;
}
