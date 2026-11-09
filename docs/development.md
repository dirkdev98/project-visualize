# Development

## Build

Desktop packages include an app icon for macOS and Linux. To revise it, edit
`assets/icon.svg` and run `npm run build:icons` on macOS with `librsvg` installed.
Normal builds copy the checked-in icon resources.

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
[Linux packaging guide](linux.md).

## Verification

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

`npm run check:visual` exercises shared component and layout fixtures across HTML,
PNG, rasterized PDF pages and the interactive app. It covers light/dark appearance,
responsive widths, layout boundaries and screenshot density. App captures use the
same content widths as exports and scroll through long artifacts. They replay the
actual viewer's draw data with transient pointer hover effects omitted; the headed
presentation check covers the window surface.
Run this suite in a graphical session with Poppler's `pdftoppm` installed. The
`check:html` command provides the browser/PNG subset.

The report in `.cache/visual-report` attaches PDF pages and app viewports alongside
browser/export images. References are scoped to the operating system and missing
references fail. Review content, layout and readability across renderers before
accepting new references with `npm run check:visual:update`. Font rasterization and
PDF pagination differ between outputs. Linked controls, text selection, offline
assets and sandboxed embedding have separate behavioural checks.

## Example exports

Widget source documents live in `examples/widgets`. Keep each example focused on
meaningful variations and use stable IDs for its sections. `npm test` verifies that
the catalogue covers the supported widget types and enumerated kinds, validates each
document through the CLI and exercises the export update/check cycle.

After building the app and installing the test browser, run:

```sh
npm run examples:check
npm run examples:update
```

The checker creates new PNG, PDF and HTML exports without changing the references.
It fails on changed, missing or obsolete files. Updates replace changed exports only
after the entire selected catalogue has rendered and its HTML has opened offline.
The generated index links desktop and phone layouts in both themes. References live
under `examples/exports/<platform>` because native rasterization varies by platform.
The Linux set is committed and maintained by CI. macOS commands keep a local,
ignored set for inspection; use the Linux container to reproduce the CI catalogue.
The bundled agent workflow includes the source documents and image assets, keeping
generated exports in the repository.

Use `-- --only text` to work on one example. `.cache/example-results` contains the
before/after exports, changed-file summary and PNG difference images. The checker
normalizes the generated revision identity in HTML and compares its remaining content
exactly. Images and every rendered PDF page require equal dimensions. Allow at most
one channel level of rounding across 0.02% of the image or complete PDF's pixels.
PDF page counts and searchable text positions must match. Browser previews also allow
minor form-control rasterization variation when their HTML is identical. Poppler
renders PDF comparisons and extracts their text bounds.

The **Rendering regression** GitHub workflow uses the Linux container and runs CLI
contracts, catalogue exports and the visual suite in bounded shards. Failed checks
upload reports for inspection. To propose new references, run the workflow manually
from `main` with **update** enabled. It regenerates exports and visual references,
then opens or updates a draft PR with the changed-file summary. It does not merge.
The repository must allow Actions to create pull requests; if that permission is
disabled, the generated updates and reports remain available as workflow artifacts.

## Viewer diagnostics

Viewer output is retained in the library's `.viewer/viewer.log`, with a previous log
rotated at launch when it reaches 1 MiB. `visualize viewer --action status` reports its
path. Unexpected viewer errors also leave `.viewer/last-error.json` with the time,
executable and stack trace.

## Architecture

The Maligator-compiled TypeScript application owns the UI, document layout, Markdown,
table transforms, chart preparation, redraw policy and exports. Generated C bindings
connect it to Dear ImGui, ImPlot and SDL. Chart styles and line wrapping are composed
in JS. [The native backend](../native/visualize.h) supplies window, font, image and GPU
operations.
The viewer and PNG/PDF exports share the TS content renderer. HTML uses browser
elements and SVG, sharing dataset transforms, diagram layout, number formats and
palette definitions with the native renderer.

Shiki runs with its JavaScript regex engine. The build captures syntax grammars as
Maligator assets, loaded when a document needs them.
[Third-party notices](../THIRD_PARTY.md) describe the dependencies.
