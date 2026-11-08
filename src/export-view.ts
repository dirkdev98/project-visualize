import { Marked } from "marked";
import type { Parameters } from "./data.ts";
import { ALL, controls, createParameters, resolveView } from "./data.ts";
import type { Artifact, Block, ControlBlock } from "./model.ts";

export function blockEntries(
  body: Block[],
  parent = "body",
): { path: string; type: Block["type"]; title?: string }[] {
  return body.flatMap((block, index) => {
    const path = `${parent}.${block.id ?? index}`;
    return [
      {
        path,
        type: block.type,
        ...(block.title ? { title: block.title } : {}),
      },
      ...("children" in block ? blockEntries(block.children, path) : []),
    ];
  });
}

export function blockAt(body: Block[], path: string): Block {
  function find(children: Block[], parent: string): Block | undefined {
    for (const [index, block] of children.entries()) {
      const key = `${parent}.${block.id ?? index}`;
      if (key === path) return block;
      if ("children" in block && path.startsWith(`${key}.`)) {
        const found = find(block.children, key);
        if (found) return found;
      }
    }
  }
  const block = find(body, "body");
  if (!block) throw new Error(`Unknown block path: ${path}`);
  return block;
}

export function exportView(
  document: Artifact,
  overrides?: unknown,
  path?: string,
): {
  document: Artifact;
  parameters: Parameters;
  partial: boolean;
  supportControls: ControlBlock[];
} {
  const parameters = createParameters(document, overrides);
  if (path === undefined)
    return { document, parameters, partial: false, supportControls: [] };
  const selected = blockAt(document.body, path);
  const retainedControls = controls({ ...document, body: [selected] });
  const retained = new Set(retainedControls.map((control) => control.id));
  const supportControls: ControlBlock[] = [];
  const view = resolveView(document, parameters);
  const external = new Map(parameters);
  for (const id of retained) external.set(id, ALL);
  const datasets = resolveView(document, external).datasets;
  function isolate(block: Block, key: string): Block {
    if (!retained.size) return blockAt(view.body, key);
    if ("children" in block)
      return {
        ...block,
        children: block.children.map((child, index) =>
          isolate(child, `${key}.${child.id ?? index}`),
        ),
      };
    if (block.type === "chart" && block.select && !retained.has(block.select)) {
      if (block.source) {
        const source = block.source,
          alias = `__visualize_${key}`;
        const comparison = new Map(external);
        comparison.set(block.select, ALL);
        datasets[alias] = resolveView(document, comparison).datasets[
          source.dataset
        ];
        supportControls.push(
          ...retainedControls
            .filter((control) => control.dataset === source.dataset)
            .map((control) => ({ ...control, dataset: alias })),
        );
        return {
          ...block,
          select: undefined,
          source: { ...source, dataset: alias },
        };
      }
      const prepared = blockAt(view.body, key) as Extract<
        Block,
        { type: "chart" }
      >;
      return { ...prepared, select: undefined };
    }
    return block;
  }
  const body: Block[] = JSON.parse(JSON.stringify([isolate(selected, path)]));
  const usedDatasets = new Map<string, Set<string>>();
  const usedAssets = new Set<string>();
  const parser = new Marked({
    walkTokens(token) {
      if (token.type === "image" && token.href.startsWith("asset:"))
        usedAssets.add(token.href.slice(6));
    },
  });
  function dataset(name: string, fields: string[]) {
    const used = usedDatasets.get(name) ?? new Set<string>();
    for (const field of fields) used.add(field);
    usedDatasets.set(name, used);
  }
  function visit(block: Block) {
    if ("children" in block) block.children.forEach(visit);
    if (block.type === "control") dataset(block.dataset, [block.field]);
    if (block.type === "table") {
      const fields = block.columns.map((column) => column.key);
      if (block.dataset) dataset(block.dataset, fields);
      if (block.rows)
        block.rows = block.rows.map((row) =>
          Object.fromEntries(
            fields
              .filter((key) => Object.hasOwn(row, key))
              .map((key) => [key, row[key]]),
          ),
        );
    }
    if ("source" in block && block.source)
      dataset(
        block.source.dataset,
        Object.entries(block.source)
          .filter(
            ([key, value]) =>
              ["field", "x", "y", "series"].includes(key) &&
              typeof value === "string",
          )
          .map(([, value]) => value as string),
      );
    if (block.type === "image") usedAssets.add(block.asset);
    if (block.type === "markdown" || block.type === "callout")
      parser.parse(block.content);
    if (block.type === "timeline")
      for (const event of block.events)
        if (event.content) parser.parse(event.content);
  }
  body.forEach(visit);
  for (const control of supportControls)
    dataset(control.dataset, [control.field]);
  const isolated: Artifact = {
    schemaVersion: document.schemaVersion,
    type: document.type,
    title: selected.title ?? document.title,
    theme: document.theme,
    pdf: document.pdf,
    body,
    assets: Object.fromEntries(
      [...usedAssets].map((name) => [name, document.assets?.[name] ?? ""]),
    ),
    datasets: Object.fromEntries(
      [...usedDatasets].map(([name, fields]) => [
        name,
        datasets[name].map((row) =>
          Object.fromEntries(
            [...fields]
              .filter((field) => Object.hasOwn(row, field))
              .map((field) => [field, row[field]]),
          ),
        ),
      ]),
    ),
  };
  return {
    document: isolated,
    parameters: new Map([...parameters].filter(([id]) => retained.has(id))),
    partial: true,
    supportControls,
  };
}
