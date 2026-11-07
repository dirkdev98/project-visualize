# Project Visualize

Create dashboards, rich documents and diagrams from an agent, then inspect the saved
artifacts in a native desktop viewer. Each revision keeps its document, context, image
assets and PNG/PDF snapshots together.

## Build

Use macOS with Apple command-line tools, Node.js and Homebrew:

```sh
brew install cmake sdl3
npm ci
npm run build
```

The build pins Maligator's alpha package and verifies downloaded native dependencies.
It produces `dist/bin/visualize` and `dist/Project Visualize.app`. These contain the
native libraries needed at runtime; Node.js and Homebrew are build dependencies.

## Create an artifact

```sh
bin/visualize render --project observatory --artifact weekly-review \
  --file examples/observatory.json
bin/visualize open --project observatory --artifact weekly-review
```

`render` returns JSON containing the version, saved document, PNG and PDF paths. Run
it again with the same project and artifact IDs to save another version. The viewer
refreshes its library automatically and lets you browse earlier versions.

```sh
bin/visualize list --project observatory
bin/visualize inspect --project observatory --artifact weekly-review
bin/visualize export --project observatory --artifact weekly-review \
  --format png --out ./weekly-review.png
```

Use `--version` with `inspect`, `open` or `export` to select an earlier revision.
`--file -` reads a document from stdin. `--width` sets the export layout width and
`--scale` controls pixel density. `--help` describes the CLI.
Use `--theme dark` with `render`, `export` or `open` for the matching dark appearance.
The viewer also has a theme button; Cmd+K focuses its library search.

Artifacts live in `~/Library/Application Support/Project Visualize`. Set
`VISUALIZE_HOME` or pass `--store` for a separate library.

## Authoring

Read [the artifact guide](docs/artifacts.md) and adapt the runnable examples in
[examples/](examples/). The [agent skill](skills/project-visualize/SKILL.md) teaches
creation, revision and screenshot delivery. Keep that folder available to your agent,
or link it into your agent's skill directory.

The viewer supports linked dataset controls, chart zoom, table sorting and filtering,
expandable sections and links. Use `--params` with `inspect`, `export` or `open` to
reproduce a linked selection. PNG/PDF exports capture the saved document with details
expanded. PDFs paginate the rendered canvas and add selectable document text and links.
Native chart labels remain rasterized. Documents describe
content and layout; arbitrary HTML, scripts and live data connectors are outside the
artifact format.

## Development

```sh
npm run build:native
npm run build
npm run check
```

`npm run check` exercises the compiled CLI, including real GPU exports and revision
preservation. Run `npm run build` after source changes. `npm run dev -- --help` uses
Maligator's development runner after the native bridge has been built.
PDF extraction checks use Poppler (`brew install poppler`).
Run `npm run check:readback` after screenshot or FFI changes. It checks writable
byte views, buffer bounds and GPU row padding in development and production builds.

Run `npm run check:viewer` in an unlocked Mac session to verify surface recovery.
It hides a test window, restores it and presents the retained UI frame. Exit code 3
means the graphics driver did not expose a deferred presentation, so that check is
inconclusive.

The Maligator-compiled TypeScript application owns the UI, document layout, Markdown,
table transforms, chart preparation, redraw policy and exports. Generated C bindings
connect it to Dear ImGui and ImPlot. The small backend in
[native/visualize.h](native/visualize.h) supplies window, font, image and GPU operations.
The viewer and exports share the TS content renderer.

Shiki runs with its JavaScript regex engine. The build captures syntax grammars as
Maligator assets, loaded when a document needs them. [Third-party notices](THIRD_PARTY.md)
describe the dependencies.
