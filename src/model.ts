export type Block = { type: string; [key: string]: unknown };

export interface Artifact {
  schemaVersion: 1;
  title: string;
  subtitle?: string;
  category?: string;
  context?: Record<string, unknown>;
  assets?: Record<string, string>;
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

export function validate(input: unknown): Artifact {
  const doc = object(input, "artifact");
  if (doc.schemaVersion !== 1) fail("schemaVersion", "expected 1");
  if (!string(doc.title, "title", 240).trim())
    fail("title", "expected a title");
  for (const field of ["subtitle", "category"]) {
    if (doc[field] !== undefined) string(doc[field], field, 1000);
  }
  if (doc.context !== undefined) object(doc.context, "context");
  const assets = doc.assets === undefined ? {} : object(doc.assets, "assets");
  for (const [name, source] of Object.entries(assets)) {
    slug(name, "asset name");
    string(source, `assets.${name}`, 4096);
  }
  let blocks = 0;
  let points = 0;
  function visit(input: unknown, location: string, depth: number) {
    if (++blocks > 1000 || depth > 12)
      fail(location, "artifact is too deeply nested or has too many blocks");
    const block = object(input, location);
    const field = (key: string) => `${location}.${key}`;
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
      case "metric":
        string(block.label, field("label"), 240);
        if (typeof block.value !== "string" && typeof block.value !== "number")
          fail(field("value"), "expected text or a number");
        scalar(block.value, field("value"));
        break;
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
        children.forEach((child, index) => {
          visit(child, `${field("children")}[${index}]`, depth + 1);
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
          if (labelCount !== undefined && values.length !== labelCount)
            fail(
              `${itemPath}.values`,
              "each series must have one value per label",
            );
          if (item.x !== undefined) {
            if (labelCount !== undefined)
              fail(
                `${itemPath}.x`,
                "use either numeric x coordinates or chart labels",
              );
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
        array(block.rows, field("rows"), 0, 5000).forEach((input, index) => {
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
  array(doc.body, "body", 1, 100).forEach((block, index) => {
    visit(block, `body[${index}]`, 0);
  });
  return doc as unknown as Artifact;
}
