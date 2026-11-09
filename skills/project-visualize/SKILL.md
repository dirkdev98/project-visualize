---
name: project-visualize
description: Show answers visually with Project Visualize, from a single table, chart or diagram to a few linked widgets or a full briefing, report or dashboard, saved as a versioned artifact and delivered as interactive HTML, PNG or PDF. Use it whenever an answer compares values or explains structure, such as benchmark and before/after results, measurements across runs, hosts or versions, options with trade-offs, trends over time, or how a system, flow or sequence works. Use it even when the user did not ask for a visual or name the app, and even when the result is one table. Do not use it to build or edit a website, app or existing UI.
---

Use this skill to show an answer instead of describing it. A rendered table or chart
is easier to scan and compare than text, keeps its data and sources with the result,
and stays available in the viewer when the user comes back to it.

Size the artifact to the answer:

- **One widget** for a quick comparison, a set of measurements or a single flow: a
  table, a chart or a diagram. Give the block an `id` and export just that block with
  `--block body.<id>`, so the user sees the widget without a document header. A small
  table reads better with a narrower `--width`, such as 720, than across the default.
- **A few related widgets** with short explanations for an analysis, such as
  baseline and candidate timings beside memory per host.
- **A full briefing, report or dashboard** when the user needs evidence, explanation
  and linked views together.

Reach for it at the moments a reader compares or follows something: benchmark or
before/after results, measurements across runs, hosts or versions, options with
trade-offs, trends over time, distributions, and how a system, flow or sequence works.
A report of measured results qualifies even when nobody asked for a visual. Requests
such as "show how this works", "compare these options", "diagram the flow" or "make a
dashboard" do not need to name the app. Keep the answer in the conversation when a
sentence or one or two numbers settle it, or when the user asked for plain text.

Choose a supported composition: tables and charts for measured data, diagrams for
structure or sequences, and rich documents for evidence with explanation. Combine them
into a dashboard when the user needs to inspect related views. Read the artifact guide
below for the schema. Do not substitute a screenshot for a requested editable website
or an interactive simulation that the artifact format cannot represent.

Use the CLI to save a versioned artifact, then deliver its interactive HTML export or
screenshot through the conversation host. The native viewer retains the organized
library and context. Generated HTML is an export, not a separate source artifact.

The reported skill directory may be a symlink. Set `skill_directory` to the directory
supplied with this skill, then resolve it physically:

```sh
skill_real=$(CDPATH= cd -P -- "$skill_directory" && pwd)
```

If `$skill_real/bundle.json` exists, read it. Resolve its `executable`, `guide` and
`examples` paths relative to `skill_real`; absolute paths stay absolute. Set
`visualize_cli` to the executable path. This copy is bundled with the application.

Otherwise, this skill lives at `skills/project-visualize` inside the checkout:

```sh
visualize_root=$(CDPATH= cd -- "$skill_real/../.." && pwd)
visualize_cli="$visualize_root/bin/visualize"
```

For a checkout, read `$visualize_root/docs/artifacts.md` and use
`$visualize_root/examples/`; follow its README if the application has not been built.
For a bundled copy, read the manifest's guide and examples. An installed
`visualize skill` also reports these resource paths. Use `--help` for command syntax.
Keep the current project's working directory when invoking `visualize_cli` so
relative input and output paths resolve there.

Write the artifact as JSON with a `type` of `dashboard`, `document` or `diagram`; the
viewer's library shows it as an icon. A one-widget artifact is a document with a
single block. Choose a project ID that matches the user's workspace and keep the same
artifact ID when revising it. Preserve the actual data, units, source references,
assumptions and uncertainty. Put the explanation in rich text and retain
the task's provenance in `context`. Declare local PNG/JPEG paths or HTTP(S) image
URLs in `assets`, and refer to them by asset ID. Remote images use a shared cache;
each saved revision retains its chosen bytes for offline viewing and export.

```sh
"$visualize_cli" validate --file document.json
"$visualize_cli" render --project orbital --artifact station-review \
  --file document.json --mobile-width 390
```

Parse the JSON result and inspect its desktop and mobile `screenshots` with the
host's image-viewing capability. New screenshots default to 2x density; use `--scale 1`
when the full canvas is too tall at that density. Fix clipping, unclear labels and
poor composition by rendering a revision.

Deliver the visual where the user reads the answer. When the host renders HTML in the
conversation, deliver the interactive HTML export there: it keeps hover details,
sortable tables and linked controls, and it fulfils a host instruction to show charts
and comparisons as rendered HTML. Export the saved revision, or the selected block,
with `--format html --html-mode inline`:

- For T3 Code, read the export and pass its contents to `html_preview`, then
  `html_render` with the measured height clamped to that tool's accepted range.
- For OpenCode, use its browser preview tool with the returned HTML path.
- Use `--html-mode fragment` only when the host's visualization contract requires a
  fragment.

Otherwise return the PNG screenshot with the host's image mechanism, with the
artifact's project, ID and version available when useful. A path alone does not
display an image on every host. A terminal can offer the standalone HTML path for
browser viewing. Fall back to PNG when the host cannot display HTML or the export
exceeds its payload limit. Honor an explicitly requested output format, such as a PNG
to post elsewhere, and do not claim an inline render from a file link alone.

Once you have chosen the revision to deliver, run `present --project ID --artifact ID
--version ID` with that exact saved version, then show its selected export.
This marks the selected delivery, not every rendering attempt or a receipt that the
person opened it. Later drafts leave that marker in place, and earlier delivered
versions keep their history.

Use `inspect` to read an existing saved document before revising it. `render` always
creates a new version. Export with an explicit `--version` when the request refers to
particular evidence. PNG, PDF and HTML exports use the saved data and current layout
engine, leaving creation-time snapshots unchanged. New captures follow the appearance
chosen in Settings or the system; pass `--theme light|dark` when a specific palette
matters.
Omit `--out` to keep the export organized in the library; use the returned path.
For a whole widget or card, read its path from `inspect`'s `view.blocks`, then export
with `--block PATH`. This selects a complete subtree, not individual diagram nodes.
Temporary viewer zoom
and filters do not change them. Use shared datasets and controls for linked widgets.
A dataset-bound bar chart can `select` its matching select control through Shift-click.
Click elsewhere in the plot to clear the selected bar without changing the saved artifact.
Its comparison bars stay visible while the other linked widgets use the selection.
Inspection exposes typed categories in `view.chartSelections`.
Use `inspect --params` to check the selected rows and derived values, then export with
the same parameters to deliver that view without revising the source. PDFs paginate
the canvas and include selectable document text. Native plot labels stay rasterized.

When the user supplies a **Copy view** object from the viewer, use its `store`,
project, artifact and version to identify the source. Pass its `params` and theme
to the CLI export to reproduce the linked selection.

Use the CLI's returned paths; do not reconstruct paths into the internal store or
edit saved version files. Run `open` only when a desktop window is useful or requested.
CLI rendering and exporting work with the viewer closed.
