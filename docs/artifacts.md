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

Set `pageBreakBefore: true` on a top-level block to start it on a fresh PDF page.
Automatic pagination continues within each section. A break before the first body
block leaves the document title on its own page. Trailing padding creates no extra
page. The viewer and PNG remain continuous; nested blocks cannot request a break
because a PDF page spans every column.

Use a `badge` with a short `label` and `tone` for status. A `timeline` contains `events`
with a `title`, optional `label`, Markdown `content` and `tone`. A `progress` block
uses a value from zero to one and the same tone colors. The
[component example](../examples/components.json) combines them with nested cards and
supporting evidence.

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

Charts use named series with numeric `values`. Supply chart `labels`, a series'
numeric `x` coordinates, or both. Without `x`, each series has one value per label.
With labels and `x`, coordinates index the labels and can leave categories absent.
Axis labels should include units. The viewer supports zooming and panning; exports
fit all the supplied data with space around its extrema.

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

Numeric columns align to the right. Set a column's `align` to `left` or `right` to
override this, and use `format` for decimal places, a prefix or a suffix:

```json
{
  "key": "availability",
  "label": "Availability",
  "format": { "decimals": 1, "suffix": "%" }
}
```

Formatting applies to numeric cells. Sorting and calculations use the original
values; table search matches both the visible formatting and the original values.

Metrics accept numeric or text values. Use `decimals`, `prefix` and `suffix` to format
numeric values without changing the underlying data.

Diagrams use nodes with unique IDs and edges referring to them through `from` and
`to`. Add normalized `x` and `y` coordinates for an explicit layout, or let nodes
flow into a grid. Node `detail` text appears on hover. Keep labels short enough to
read inside a node. Narrow canvases stack nodes vertically to keep labels and
connections readable. The [dashboard example](../examples/observatory.json) composes
charts, tables and a diagram with their explanation.

## Linked views

Put shared rows in a named `datasets` entry. A table's `dataset` uses those rows; a
metric or chart's `source` derives values from them. Controls filter linked evidence
bound to the same dataset. See the [linked dashboard](../examples/linked-observatory.json)
for a complete example.

```json
{
  "schemaVersion": 1,
  "title": "Station selection",
  "datasets": {
    "results": [
      { "station": "North", "accepted": 12 },
      { "station": "South", "accepted": 18 }
    ]
  },
  "body": [
    {
      "type": "control",
      "id": "station",
      "kind": "select",
      "label": "Station",
      "dataset": "results",
      "field": "station"
    },
    {
      "type": "metric",
      "label": "Accepted",
      "source": {
        "dataset": "results",
        "field": "accepted",
        "aggregate": "sum"
      }
    }
  ]
}
```

Each control has a globally unique `id`. A `select` matches a scalar exactly, `search`
matches text without case sensitivity, `range` includes numeric values between its
bounds, and an enabled `toggle` keeps rows whose field is `true`. Controls combine
with AND. Options and inferred bounds come from the original dataset, so a selection
can always be changed. Missing cells behave as null; numeric operations do not coerce
text, booleans or null into numbers.

Use a control's `default` for the initial view. Select defaults and parameters preserve
scalar types: `1`, `"1"` and `null` are different selections. `{ "all": true }` clears
a control. A range parameter is an object with `min`, `max` or both. Search parameters
are strings; toggle parameters are booleans. Reset controls restores the saved defaults.

Metric sources support `sum`, `mean`, `count`, `min` and `max`. Count counts rows and
needs no field. An empty sum is zero; an empty mean, minimum or maximum displays
`N/A`. Chart sources name `x`, optionally `y` and a grouping `series` field. Bars sum
by category by default; line and scatter charts preserve source points unless an
`aggregate` is supplied. Numeric x values retain their coordinates unless a bar chart
supports selection. Other x values form categories in source order. An absent
category/series pair stays absent.

Set a dataset-bound bar chart's `select` to a select-control ID for the same dataset
and x field. Shift-click a visible bar to select that raw category across the linked
view; repeat to clear it. Plain dragging pans, the wheel zooms, and a plain
double-click fits the data. Shift is reserved for category selection. The
legend remains outside the plot so toggling a series cannot select a bar underneath.
Selection bars treat numeric values as separate categories and preserve scalar types.
The control can appear anywhere in the document. The driving chart retains its
comparison bars and highlights the chosen category while the other linked widgets
use the selection. Other controls still filter the driving chart, including another
control on the same field. Changing only its own selection preserves pan and zoom.

Inspect, export or open a reproducible selection with `--params`:

```sh
bin/visualize inspect --project orbital --artifact review --params '{"station":"North"}'
bin/visualize export --project orbital --artifact review --format png \
  --out ./north.png --params '{"station":"North"}'
```

Inspection returns the saved document plus a resolved `view` with parameters, row
counts, widget values and typed `chartSelections` keyed by block path. Parameter
exports rerender the view even at the saved width
and scale. They preserve the source, default snapshots and version history.

## Heatmaps

Use a `heatmap` for values across two categorical axes. Its static form has typed
`x` and `y` categories and a row-major `values` matrix. Each row matches a `y` category;
each cell matches an `x` category. Use `null` for missing evidence. Zero remains a real
observation. Categories must be unique by type and value.

```json
{
  "type": "heatmap",
  "x": ["Mon", "Tue"],
  "y": ["North", "South"],
  "values": [[93, 96], [null, 88]],
  "min": 0,
  "max": 100,
  "suffix": "%"
}
```

A heatmap `source` names a dataset, categorical `x` and `y` fields, a numeric `field`
and an optional `aggregate`. Mean is the default; count needs no numeric field.
Only populated numeric buckets aggregate, so an empty sum stays missing. Controls
filter the observations while axes and inferred color bounds retain their original
order and scale. Nonnumeric measure values remain missing rather than becoming zero.

Supply both `min` and `max` to fix the scale across documents. Set `decimals` and
`suffix` for the cell labels. Equal bounds use one midpoint color. Empty selections
keep the grid and its missing-cell labels. Narrow layouts split columns into bands
with repeated row labels. PDF continuation pages repeat the column headings, and
labels and values remain selectable. The [heatmap example](../examples/heatmap.json)
combines the grid with linked controls and a selectable bar chart.

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

Images keep their natural proportions and shrink to the available width without
upscaling. Set an image block's `height` to create a full-width frame. The default
`fit: "contain"` centers the whole image inside it; `fit: "cover"` fills the frame
by cropping equally from the long axis. Captions remain selectable in PDF exports.

## Exports

Documents default to a light theme. Set `"theme": "dark"` for a matching dark canvas,
controls and syntax colors. `render --theme light|dark` overrides that field and saves
the chosen appearance. `export --theme light|dark` rerenders an appearance without
changing the saved evidence.

The viewer's theme button and Cmd+Shift+L change its temporary appearance. Cmd+K
focuses the artifact-library search. These interactions preserve saved snapshots;
the viewer's Saved PDF button opens the creation-time export.

The saved PNG and PDF use the render command's width and scale. Exporting at the
same settings copies that snapshot. Changing `--width`, `--scale`, `--theme` or `--params` rerenders the
saved data and copied images without creating a revision. Viewer filters, chart
zoom and other temporary interactions do not change the saved export.

Exports contain the whole document. An artifact that exceeds the GPU surface limit
fails with an error; split a long report into separate artifacts or reduce its scale.

PNGs keep a continuous canvas. PDFs use A4 landscape pages by default, with margins
and page numbers. Set the document's `pdf` options for a different paper or orientation:

```json
{ "pdf": { "paper": "letter", "orientation": "portrait" } }
```

PDF page breaks preserve blocks when they fit and split oversized content at recorded
text-line and table-row boundaries. Trailing blank canvas does not create another
page. Tables, including Markdown tables, repeat their
headings on continuation pages. Side-by-side tables share a header band; an unusually
tall heading can be omitted when it leaves no room for body text. If parallel content
has no safe text boundary, stack it vertically. Document text is searchable and selectable, and
Markdown links remain clickable. The visible page is the captured rendering; native
plot labels stay rasterized. The text layer does not provide tagged-PDF accessibility.
PDF pagination keeps Markdown headings with the first following body line when
that group fits on a page. Parallel columns may require a break between complete
text lines when their preferred section boundaries conflict.
Reduce the layout `--width` when a report needs larger text on paper.
For narrow canvases, use portrait paper or shorter explicit chart heights to keep
figures with their surrounding titles and captions.
