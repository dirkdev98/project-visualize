---

name: project-visualize
description: Create, revise and export saved dashboards, rich documents and diagrams through the Project Visualize native application and CLI. Use when the user asks for Project Visualize artifacts or its established project workflow.
---

Use the CLI to save a versioned artifact and return its screenshot to the conversation.
The native viewer adds chart navigation, sortable tables and retained context.

Find `visualize` on PATH, or use `bin/visualize` from the Project Visualize checkout.
If the project has not been built, follow its README. Use `--help` for command syntax.
Read [the artifact guide](../../docs/artifacts.md) before authoring a document, and
adapt [the examples](../../examples/) for the requested content.

Write the artifact as JSON. Choose a project ID that matches the user's workspace and
keep the same artifact ID when revising it. Preserve the actual data, units, source
references, assumptions and uncertainty. Put the explanation in rich text and retain
the task's provenance in `context`. Use local image assets when needed.

```sh
bin/visualize validate --file document.json
bin/visualize render --project orbital --artifact station-review --file document.json
```

Parse the JSON result and inspect the returned PNG with the host's image-viewing
capability. Fix clipping, unclear labels and poor composition by rendering a revision.
Return the screenshot using the conversation host's supported image mechanism, with
the artifact's project, ID and version available when useful. A path alone does not
display an image on every host.

Use `inspect` to read an existing saved document before revising it. `render` always
creates a new version. Export with an explicit `--version` when the request refers to
particular evidence. PNG and PDF exports use the saved data; temporary viewer zoom
and filters do not change them. Use shared datasets and controls for linked widgets.
A dataset-bound bar chart can `select` its matching select control through Shift-click.
Inspection exposes typed categories in `view.chartSelections`.
Use `inspect --params` to check the selected rows and derived values, then export with
the same parameters to deliver that view without revising the source. PDFs paginate
the canvas and include selectable document text. Native plot labels stay rasterized.

Use the CLI's returned paths; do not reconstruct paths into the internal store or
edit saved version files. Run `open` only when a desktop window is useful or requested.
CLI rendering and exporting work with the viewer closed.
