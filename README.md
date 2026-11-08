# Project Visualize

Create dashboards, rich documents and diagrams from an agent, then inspect the saved
artifacts in a native desktop viewer. Each revision keeps its document, context, image
assets and PNG/PDF snapshots together.

Export saved revisions as self-contained interactive HTML for browser and agent-host
previews. The library retains the structured artifact; HTML is an export format.

## Build

Use macOS with Apple command-line tools, Node.js and Homebrew:

```sh
brew install cmake pkgconf sdl3
npm ci
npm run build
```

The build pins Maligator's alpha package and verifies downloaded native dependencies.
It produces `dist/bin/visualize` and `dist/Project Visualize.app`. These contain the
native libraries needed at runtime; Node.js and Homebrew are build dependencies.
For Linux x64 builds, tarballs and Debian packages, use the
[Linux packaging guide](docs/linux.md).

## Create an artifact

```sh
bin/visualize render --project observatory --artifact weekly-review \
  --file examples/observatory.json
bin/visualize open --project observatory --artifact weekly-review
```

`render` returns JSON containing the version, saved document, PNG and PDF paths. Run
it again with the same project and artifact IDs to save another version. The viewer
refreshes its library automatically and lets you browse earlier versions.

Archive an artifact with the viewer's archive action or
`visualize archive --project ID --artifact ID`. All its revisions stay saved and
searchable. Search includes archived artifacts; restore one from its toolbar or with
`visualize restore --project ID --artifact ID`.

Use `export --format html` for an offline interactive page. Omit `--out` to keep
exports organized in the library, or provide a destination. `inspect` lists paths in
`view.blocks`; pass `--block PATH` to export one whole widget or card as PNG, PDF or
HTML. See [exports](docs/artifacts.md#exports) for host embedding modes.

```sh
bin/visualize list --project observatory
bin/visualize inspect --project observatory --artifact weekly-review
bin/visualize export --project observatory --artifact weekly-review \
  --format png --out ./weekly-review.png
```

Use `--version` with `inspect`, `open` or `export` to select an earlier revision.
`--file -` reads a document from stdin. `--width` sets the export layout width and
`--scale` controls pixel density. `--help` describes the CLI.
Rendering and exporting default to 2x screenshots. Add `--mobile-width 390` to
`render` to save desktop and phone PNGs in the same revision; their paths are in
`screenshots`.
Use `export --width 390` for a phone layout of an existing revision, or `--scale 1`
when a single-density image is preferable.
Exports render the saved document with the current layout engine, preserving its
creation theme and leaving the original snapshots unchanged.
Use `--theme dark` with `render`, `export` or `open` for an explicit dark appearance.
The viewer follows system appearance by default. Open **Settings…** from the Mac
application menu or press Cmd+,. Linux uses the sidebar Settings button or Ctrl+,.
Settings can force light or dark
mode and adjust scroll speed. New captures inherit that preference unless the document
or command supplies a theme. Cmd+K focuses library search; Cmd+Shift+L toggles appearance.

Artifacts live in `~/Library/Application Support/Project Visualize`. Set
`VISUALIZE_HOME` or pass `--store` for a separate library.
Linux uses `$XDG_DATA_HOME/project-visualize`, defaulting to
`~/.local/share/project-visualize`.

## Authoring

Read [the artifact guide](docs/artifacts.md) and adapt the runnable examples in
[examples/](examples/). The [agent skill](skills/project-visualize/SKILL.md) teaches
creation, revision and screenshot delivery. Keep that folder available to your agent,
or link it into your agent's skill directory. The skill resolves that link to find
the CLI, guide and examples in this checkout. The `bin/visualize` wrapper also resolves
its own links, so it can be linked into a directory on PATH.

The binary embeds the skill, artifact guide and examples. `visualize skill` reports
their paths; `visualize skill --out DIRECTORY` extracts a self-contained bundle.
Its `bundle.json` identifies the executable and resources for linked installations.
In **Settings**, **Install CLI** and **Link skill** show editable destinations and offer
copyable shell commands. Installation preserves existing files and links. Keep a shared
source skill link if you already use one, or choose a different destination for the bundle.
The CLI exposes the same actions through `install --cli PATH` and `install --skill PATH`.
Keep the application at its installed location so its links remain valid.

After inspecting revisions, mark the one selected for delivery with
`visualize present --project ID --artifact ID --version ID`. The viewer follows the
presented version by default and offers Follow latest for inspecting newer drafts.
Earlier presented versions keep their delivery history.

The viewer supports linked dataset controls, chart zoom, table sorting and filtering,
expandable sections and links. Diagrams cover process flows, states, hierarchies,
relationships, message sequences and schedules. Distribution plots and waterfalls
complement the trend charts. See the [authoring guide](docs/artifacts.md) for their
data contracts. Use `--params` with `inspect`, `export` or `open` to
reproduce a linked selection. PNG/PDF exports capture the saved document with details
expanded. PDFs paginate the rendered canvas and add selectable document text and links.
Native chart labels remain rasterized. Documents describe
content and layout; arbitrary HTML, scripts and live data connectors are outside the
artifact format.

Drag a graph to pan, pinch over it to zoom, or hold Cmd while scrolling (Ctrl on other
platforms). Ordinary scrolling moves the document. Hover a graph for zoom in, zoom out
and fit buttons; double-clicking a graph also fits it. Mac scrolling defaults to 20 percent of the raw
wheel input and can be adjusted in Settings.

The sidebar lists projects and artifacts by latest activity. Each row shows the
artifact's type icon, title and time since its last revision or presentation; a dot
marks artifacts with a presented revision, and the tooltip names the artifact ID. A
project shows its five most recent artifacts until you choose **Show more…**. Drag the
sidebar's right edge to resize it; the width is saved with library settings. The footer
identifies the current library. Choose a revision in the header's version menu to keep
that snapshot open, or choose **Follow latest** to display new revisions as agents save
them. The header's icon actions copy the PNG path, open the saved PDF, toggle context
and copy the view. Context stacks below the canvas in a narrow window. The copied view
shares the exact library, revision, theme and linked-control parameters with an agent.
Context also shows the current typed control values. Escape closes Settings.

## Development

```sh
npm run build:native
npm run build
npm run check
```

Install the test browser once with `npm run setup:browser`.

`npm run check` exercises the compiled CLI, including real GPU exports and revision
preservation. Run `npm run build` after source changes. `npm run dev -- --help` uses
Maligator's development runner after the native bridge has been built.
PDF extraction checks use Poppler (`brew install poppler`).
Run `npm run check:readback` after screenshot or FFI changes. It checks writable
byte views, RGB conversion, buffer bounds and GPU row padding in both build modes.
Run `npm run check:bindings` after sort or scalar binding changes to verify counted
sort records and double slider values in both build modes.
Run `npm run check:images` after image drawing changes to check native UV sampling,
rounded corners and texture disposal in both build modes.
Run `npm run check:plots` after series adapter changes to verify supplied legend
colors and shaded baseline fitting in both build modes.
Run `npm run check:selection` after document text or selection changes to verify
Unicode, formatted text, highlighted code and native clipboard shortcuts in both modes.
Run `npm run check:inputs` after input adapter changes to verify paste, undo, redo,
non-text clipboards and UTF-8 buffer limits through the native editor.
Run `npm run check:navigation` after graph input changes to verify ordinary scrolling,
modified zoom, fitting and SDL pinch accumulation in both modes. This offscreen check
does not establish physical trackpad delivery. The native bridge requires SDL 3.4.18
or newer.
Run `npm run check:menu` on macOS after changing application commands. It verifies the
native Settings menu and Command-comma dispatch.
Use `-- --production` with a native probe to isolate its production profile.

Run `npm run check:viewer` in an unlocked Mac session to verify surface recovery.
It hides a test window, restores it and presents the retained UI frame. Exit code 3
means the graphics driver did not expose a deferred presentation, so that check is
inconclusive.
Pass `-- --visible` to check initial window presentation without hiding it. Linux can
run this mode under Xvfb or a headless Wayland compositor.

`npm run check:html` renders shared component and layout fixtures through both native
and browser exports. It checks light/dark appearance at phone, medium and wide widths,
clipping, offline assets, linked controls, selection and sandboxed embedding. The HTML
report in `.cache/html-report` attaches paired screenshots. Golden images are scoped
to the operating system; review the pairs before accepting new references with
`npm run check:html:update`. Compare values, layout and readability across renderers;
font rasterization differs between native and browser output.

The Maligator-compiled TypeScript application owns the UI, document layout, Markdown,
table transforms, chart preparation, redraw policy and exports. Generated C bindings
connect it to Dear ImGui, ImPlot and SDL. Chart styles and line wrapping are composed
in JS. [The native backend](native/visualize.h) supplies window, font, image and GPU
operations.
The viewer and PNG/PDF exports share the TS content renderer. HTML uses browser
elements and SVG, sharing dataset transforms, diagram layout, number formats and
palette definitions with the native renderer.

Shiki runs with its JavaScript regex engine. The build captures syntax grammars as
Maligator assets, loaded when a document needs them. [Third-party notices](THIRD_PARTY.md)
describe the dependencies.
