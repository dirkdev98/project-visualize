# Decisions

## 2026-11-07 export resource lifetime

- Dispose the GPU surface, document images and syntax caches after copying captured
  pixels, before PNG/PDF encoding. The copied bytes own their storage, so encoding
  does not need to overlap those rendering resources.
- Keep this as a lifetime correction without claiming a material speedup. Five
  interleaved fresh-process samples per build on AC produced byte-identical PNGs and
  PDFs. Median peak RSS changed from 47.2 to 46.6 MiB for the control, 100.9 to
  99.7 MiB for the dashboard, and 90.4 to 88.6 MiB for the notebook. Median elapsed
  times stayed within roughly 2 ms. These are indicative peak-RSS measurements,
  distinct from idle physical footprint.

## 2026-11-07 linked snapshot controls

- Bind tables, aggregate metrics and charts to named scalar datasets. Keep filtering,
  aggregation and chart preparation in JS, and share the resolved view between the
  native viewer, CLI inspection and parameterized exports.
- Combine select, search, inclusive numeric range and enabled-boolean controls on a
  dataset. Derive choices and bounds from the original rows so filtering cannot hide
  the way out of a selection. Preserve scalar types and use an explicit all-values
  sentinel because null is a meaningful data value.
- Preserve empty results and sparse chart groups without fabricating observations.
  Scope controls and chart ranges to a saved revision, refit charts when their data
  changes, and keep ordinary redraws from resetting pan and zoom.
- Rerender explicit CLI parameters without changing the source, default snapshots or
  version history. Reserve native input and revision-switch acceptance for an unlocked
  Mac session; offscreen rendering and public CLI checks cover the data path.
- Use a named interface for the all-values type predicate. Maligator's compact TS
  stripper rejected the inline object return type, another potential parser improvement.

## 2026-11-07 JS document rendering

- Move viewer composition, document layout, table transforms, chart preparation,
  diagram geometry, rich text, image caching and redraw scheduling into Maligator
  JS/TS. The native backend exposes platform and rendering operations without knowing
  the artifact schema.
- Use Marked for Markdown and Shiki's JavaScript regex engine for syntax highlighting.
  Capture grammar data as Maligator assets and load languages on demand. Scope grammar,
  token and image resources to the current document so revisions can release them.
- Capture a rendered artifact once for both PNG and PDF. Keep PDF assembly in JS and
  use the same content renderer for exports and the desktop viewer.
- Use explicit constructor fields because the compact TS stripper rejects parameter
  properties. Keep a generic single-tick adapter because the FFI rejects the chart
  library's array of C-string pointers. These are potential upstream improvements.

Keep track of;

- Profile the remaining syntax grammar conversion and export allocation costs.
- Recheck C-string pointer arrays and TS parameter properties when updating Maligator.

## 2026-11-07 JS renderer performance cost

- Keep the richer JS renderer as a functional checkpoint. On AC power, three
  interleaved fresh-process samples per build compared the same frozen JSON inputs and
  produced PNG and PDF together. Median times were 54..59 ms for a small control,
  156..238 ms for the dashboard, and 121..191 ms for the notebook, before and after.
- Peak process RSS changed from 39.8 to 46.4 MiB, 80.7 to 102.2 MiB, and 66.0 to
  90.2 MiB respectively. These are indicative laptop comparisons of the complete
  product change, including new highlighting and layout, rather than an isolated FFI
  speed comparison. Peak RSS is distinct from the earlier idle physical footprint.
- Retain on-demand grammar assets and the shared PNG/PDF capture to avoid unnecessary
  startup parsing and duplicate rendering. Keep visible-window CPU and memory
  acceptance pending until native UI measurements are available.

## 2026-11-07 native UI bindings

- Use generated C bindings for Dear ImGui and ImPlot so Maligator can compose native
  widgets directly. Keep document interpretation and application behavior in JS/TS.
- Pin each binding and its native toolkit to matching source revisions. Regenerating
  the wrappers locally failed on C++ attributes and header language handling, so consume
  the upstream-generated bindings with their matching toolkit sources.
- Keep window creation, UI calls and resource disposal on the main thread. Pass input
  buffers and chart arrays through typed FFI rather than a document-level JSON bridge.

Keep track of;

- Recheck upstream wrapper generation before changing the native toolkit revisions.

## 2026-11-07 idle performance evidence

- Retain event-driven redraws. On AC power, the redraw-only comparison used the same
  saved dashboard and visible Retina window, with three interleaved 15-second samples
  per production build after 10-second warmups. Median CPU fell from 3.635% to 0.082%
  of one core, about 44x lower; ranges were 3.272..9.342% and 0.076..0.189%.
- Median physical memory footprint fell from 238.3 MiB to 81.6 MiB, about 2.9x lower.
  The ranges were 238.0..238.5 MiB and 81.3..105.9 MiB. This does not establish a 10x
  total memory reduction. Keep the original source, binary identities and raw samples
  in `.cache/performance` for comparisons with the JS renderer.
- Keep final native interaction and revision-cache verification pending while the Mac
  window is unavailable to automation. Headless CLI and export checks can continue.

## 2026-11-06 idle rendering and document resources

- Redraw for input, content changes and timed UI behavior, so an idle window does not
  repeatedly submit unchanged GPU work. Keep event waits bounded so the host can refresh
  the artifact library.
- Release images and parsed rich text when the selected revision changes, so browsing
  history does not retain those resources. Saved revisions and their interaction state
  remain available when revisited.

Keep track of;

- Verify native interactions after idle and resource use while revisiting revisions in
  an unlocked Mac session.

## 2026-11-06 stock runtime and viewer state

- Pin Maligator to `0.1.0-alpha.32` and consume the upstream initialization fix, so
  application startup uses the published runtime without local corrections.
- Scope canvas interaction state to each saved version, so chart ranges, table filters
  and scroll positions stay with the data they describe.

## 2026-11-06 declarative artifact versions

- Store each rendered revision as a separate document with its context and copied
  image assets, so later revisions and source-file edits preserve earlier evidence.
- Use CommonMark for rich text and compose it with native dashboard widgets. Keep
  application logic, validation and storage in Maligator, with a C ABI for the GPU
  renderer and desktop input.
- Share the content renderer between the viewer and offscreen exports. Save PNG and
  raster PDF snapshots for each version so agents can export without opening a window.
- Start with a local macOS library and snapshot data. Viewer interactions explore that
  snapshot without changing the saved version.

## 2026-11-06 native artifact tools

- Build a native desktop viewer, an agent CLI, and an agent skill for visualization
  and artifact creation, so agents can create artifacts and people can inspect them.
- Use Maligator and wgpu-native, as chosen for the application stack.
- Organize artifacts in projects, preserve their versions, support varied widgets and
  layouts, and export PNG and PDF for use outside the viewer.
