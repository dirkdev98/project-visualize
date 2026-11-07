---

name: project-visualize
description: Create, revise and export saved dashboards, rich documents and diagrams through the Project Visualize native application and CLI. Use when the user asks for Project Visualize artifacts or its established project workflow.
---

Use the CLI to save a versioned artifact and return its screenshot to the conversation.
The native viewer adds chart navigation, sortable tables and retained context.

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
viewer's library shows it as an icon. Choose a project ID that matches the user's
workspace and keep the same artifact ID when revising it. Preserve the actual data, units, source
references, assumptions and uncertainty. Put the explanation in rich text and retain
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
Return the screenshot using the conversation host's supported image mechanism, with
the artifact's project, ID and version available when useful. A path alone does not
display an image on every host.

Once you have chosen the revision and screenshot to deliver, run `present --project
ID --artifact ID --version ID` with that exact saved version, then return its image.
This marks the selected delivery, not every rendering attempt or a receipt that the
person opened it. Later drafts leave that marker in place, and earlier delivered
versions keep their history.

Use `inspect` to read an existing saved document before revising it. `render` always
creates a new version. Export with an explicit `--version` when the request refers to
particular evidence. PNG and PDF exports use the saved data and current layout engine,
leaving creation-time snapshots unchanged. New captures follow the appearance chosen
in Settings or the system; pass `--theme light|dark` when a specific palette matters.
Temporary viewer zoom
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
