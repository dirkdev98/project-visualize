# Artifact authoring

Write a JSON document with a title and a body. Use context for the question, sources,
assumptions and explanation that should remain available when someone reopens it.

```json
{
  "schemaVersion": 1,
  "title": "Station review",
  "context": {
    "source": "Fictional example",
    "summary": "Compare accepted results."
  },
  "body": [
    {
      "type": "markdown",
      "content": "## Finding\n\nAccepted results increased."
    },
    { "type": "metric", "label": "Accepted results", "value": 54 }
  ]
}
```

Validate a document before rendering it:

```sh
bin/visualize validate --file document.json
bin/visualize render --project orbital --artifact review --file document.json
```

The CLI writes JSON to stdout and errors to stderr with a failing exit code. A failed
render publishes no version. Project and artifact IDs are lowercase slugs. The
[validator](../src/model.ts) defines accepted fields and input limits.

## Rich content

Use `markdown` blocks for CommonMark text, including headings, emphasis, links, nested
lists, quotes and fenced code. Table, strikethrough and task-list extensions are
enabled. Raw HTML is displayed as text. Code is displayed without execution.

Use a `code` block when code needs its own title or language label, and a `callout`
for a highlighted explanation. The [notebook example](../examples/notebook.json)
shows rich text in a complete document.

Code blocks and fenced Markdown use Shiki highlighting for bundled languages. Unknown
language labels render as plain code. Code is never executed, and copying it preserves
the original source.

## Composition

Group blocks inside `row`, `column` or `card` children. A row's optional `weights`
sets relative column widths. Rows stack vertically in a narrow viewport. A `details`
section is expandable in the viewer and expanded in exports.

An optional block `id` keeps its interaction key stable when neighboring blocks move.
Use a lowercase letter followed by letters, digits, hyphens or underscores. IDs must be
unique among siblings.

```json
{
  "type": "row",
  "weights": [2, 1],
  "children": [
    {
      "type": "markdown",
      "content": "## Evidence\n\nExplain the result here."
    },
    { "type": "metric", "label": "Accepted results", "value": 54 }
  ]
}
```

## Evidence

Charts use named series with numeric `values`. Supply either chart `labels` or a
series' numeric `x` coordinates. Coordinate arrays and labels must match the values.
Axis labels should include units. The viewer supports zooming and panning; exports
fit all the supplied data.

```json
{
  "type": "chart",
  "kind": "line",
  "yLabel": "Accepted results",
  "labels": ["Mon", "Tue", "Wed"],
  "series": [{ "name": "Station North", "values": [12, 18, 24] }]
}
```

Tables use `columns` with a `key` and `label`, plus rows keyed by those column names.
Cells hold text, numbers, booleans or null. Sort and filter in the viewer; exports
include all source rows in their saved order.

Diagrams use nodes with unique IDs and edges referring to them through `from` and
`to`. Add normalized `x` and `y` coordinates for an explicit layout, or let nodes
flow into a grid. Node `detail` text appears on hover. Keep labels short enough to
read inside a node. The [dashboard example](../examples/observatory.json) composes
charts, tables and a diagram with their explanation.

## Images

Declare local PNG/JPEG files in `assets`. Paths resolve relative to the source JSON,
or the working directory when reading stdin. Saved versions copy the image bytes.

```json
{
  "schemaVersion": 1,
  "title": "Observation notes",
  "assets": { "station": "./station.png" },
  "body": [
    { "type": "image", "asset": "station", "caption": "Station reference" },
    { "type": "markdown", "content": "![Station reference](asset:station)" }
  ]
}
```

Markdown images use `asset:NAME` references. Network images are not fetched. Use a
new `render` invocation to revise an artifact; preserve returned version IDs when
referring to particular evidence.

## Exports

The saved PNG and PDF use the render command's width and scale. Exporting at the
same settings copies that snapshot. Changing `--width` or `--scale` rerenders the
saved data and copied images without creating a revision. Viewer filters, chart
zoom and other temporary interactions do not change the saved export.

Exports contain the whole document. An artifact that exceeds the GPU surface limit
fails with an error; split a long report into separate artifacts or reduce its scale.
