---

name: project-visualize
description: Create, revise and export saved dashboards, rich documents and diagrams through the Project Visualize native application and CLI. Use when the user asks for Project Visualize artifacts or its established project workflow.
---

Use the CLI to save a versioned artifact and return its screenshot to the conversation.
The native viewer adds chart navigation, sortable tables and retained context.

This skill lives at `skills/project-visualize` inside the application checkout. Its
reported directory may be a symlink. Set `skill_directory` to the directory supplied
with this skill, then resolve the physical directory before locating the checkout:

```sh
skill_real=$(CDPATH= cd -P -- "$skill_directory" && pwd)
visualize_root=$(CDPATH= cd -- "$skill_real/../.." && pwd)
"$visualize_root/bin/visualize" --help
```

Read `$visualize_root/docs/artifacts.md` before authoring a document, and adapt the
examples in `$visualize_root/examples/`. If the application has not been built,
follow `$visualize_root/README.md`. Keep the current project's working directory
when running the absolute CLI path so relative input and output paths resolve there.

Write the artifact as JSON. Choose a project ID that matches the user's workspace and
keep the same artifact ID when revising it. Preserve the actual data, units, source
references, assumptions and uncertainty. Put the explanation in rich text and retain
the task's provenance in `context`. Declare local PNG/JPEG paths or HTTP(S) image
URLs in `assets`, and refer to them by asset ID. Remote images use a shared cache;
each saved revision retains its chosen bytes for offline viewing and export.

```sh
"$visualize_root/bin/visualize" validate --file document.json
"$visualize_root/bin/visualize" render --project orbital --artifact station-review \
  --file document.json --mobile-width 390
```

Parse the JSON result and inspect its desktop and mobile `screenshots` with the
host's image-viewing capability. New screenshots default to 2x density; use `--scale 1`
when the full canvas is too tall at that density. Fix clipping, unclear labels and
poor composition by rendering a revision.
Return the screenshot using the conversation host's supported image mechanism, with
the artifact's project, ID and version available when useful. A path alone does not
display an image on every host.

Use `inspect` to read an existing saved document before revising it. `render` always
creates a new version. Export with an explicit `--version` when the request refers to
particular evidence. PNG and PDF exports use the saved data; temporary viewer zoom
and filters do not change them. Use shared datasets and controls for linked widgets.
A dataset-bound bar chart can `select` its matching select control through Shift-click.
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
