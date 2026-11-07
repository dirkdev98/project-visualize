# Decisions

## 2026-11-07 table continuation headings

- Repeat data-table and Markdown headings within their captured column bounds on
  continuation pages. Reuse the shared image and font resources, and repeat the
  selectable heading text and links with the same placement.
- Prefer complete rows while preserving actual text lines when parallel columns have
  conflicting row boundaries. Keep an original heading with its first body line.
  Omit a repeated heading when it leaves no room for content, and report layouts with
  no safe text break instead of clipping glyphs.
- Reserve one shared heading band for disjoint tables. Neighboring content gains that
  space on continuation pages; separate column reflow would require a different
  document layout model. Verify wrapped rows, tables beside charts and dark 2x exports
  without claiming a performance improvement from the document feature.

## 2026-11-07 standalone application notices

- Bundle third-party notices inside the standalone app as well as the full CLI
  distribution. Sign the app after assembling those resources so copying the app
  alone preserves both its runtime dependencies and their notices.
- Verify the copied app outside the checkout with a fresh temporary asset cache.
  Bundled fonts and syntax assets materialize there, and a saved artifact exports
  after its original input file is removed.

## 2026-11-07 geometry-query experiment

- Revert the attempt to guard existing PDF geometry queries out of preliminary and
  viewer frames. Three interleaved fresh-process samples per build on AC produced
  byte-identical PNGs and PDFs, but did not establish an end-to-end benefit.
- Median export times changed from 102 to 100 ms for the control, 357 to 359 ms for
  the dashboard, 301 to 303 ms for the notebook, and 871 to 885 ms for the dense table.
  Peak RSS was materially unchanged. Treat these as indicative laptop measurements
  and keep the simpler rendering path.

## 2026-11-07 matching light and dark themes

- Keep light as the default and add matching dark canvas, control, chart and syntax
  colors. Change colors without rebuilding font resources. Load syntax themes on
  demand and release cached code colors when the appearance changes.
- Save an explicit render-theme override with the source. Keep export and viewer
  overrides temporary so they preserve the creation-time snapshots and version history.
  Label the viewer's PDF action as the saved export to make that distinction visible.
- Add Cmd+K for library search and Cmd+Shift+L for appearance. Queue appearance changes
  between frames so style-stack restoration cannot mix the two palettes.
- Preserve a reduced parser diagnostic: a nested arrow expression in an object-property
  value runs as a JS entry but fails after TypeScript stripping. Clear loops avoid the
  diagnostic's parser failure without changing application behavior.

Keep track of;

- Verify on-screen theme switching and shortcuts when native window capture is usable.
  Offscreen light/dark rendering and repeated syntax-theme switching work. The native
  hide/restore check passed earlier, then could not acquire a visible surface again;
  closing the other viewer did not resolve that later limitation.
- Recheck nested-arrow property values when updating Maligator's TypeScript parser.

## 2026-11-07 deferred native presentation

- Report deferred surface acquisition to JS and retain the unpresented frame. Retry
  after the bounded idle wait without recomposing widgets. Refresh and selection run
  first so disposed document textures are replaced before another presentation attempt.
- Retry only before drawing. The GPU UI backend expects one draw per ImGui frame;
  presentation failure after drawing is an error, with the acquired resources released.
- Keep a native presentation check that hides and restores its own window. The fixed
  backend reports deferral and presents the retained frame without advancing ImGui.
  The earlier wrapper reported success while hidden, hiding that distinction.
- Foreground default-library rendering, live revision refresh and keyboard revision
  selection work. The connection between the deferred-frame gap and the earlier
  background-launch black window remains unproved.

## 2026-11-07 rounded surfaces and document widgets

- Keep table-based auto-height layout and draw rounded panel backgrounds through
  independent native draw-list splitters. Pool one splitter per active nesting depth,
  merge in reverse order, and release the handles before closing the rendering context.
  This preserves measured content bounds without extra layout-settling frames.
- Add status badges and timelines with Markdown event descriptions. Compose geometry,
  typography and tone colors in JS through the existing FFI, and keep the text available
  in PDF exports. Use the same restrained colors for progress and callouts.
- Stack diagram nodes on narrow canvases to preserve readable labels and connections.
  Foreground native viewing and wide/narrow export captures confirm the nested layout;
  do not infer a performance win from these appearance changes.

Keep track of;

- Investigate the initial black surface observed after background application launch.
  A foreground launch with the same default library rendered correctly. The deferred
  presentation fix closes one lost-frame path without proving that it caused this case.

## 2026-11-07 pinned font bytes

- Preserve the vendored font license's original line endings in Git. Its upstream
  checksum covers those bytes, so automatic text normalization would make a fresh
  checkout fail the build's integrity check.

## 2026-11-07 paginated and selectable documents

- Keep PNGs continuous and paginate PDF captures onto A4 landscape pages by default,
  with author controls for paper and orientation. Record final-pass block, line and
  table-row boundaries so page breaks preserve content that fits and avoid isolated
  container borders. Reuse one captured image across the pages.
- Add a selectable text layer and link annotations with pdf-lib and fontkit. Share
  bundled IBM Plex fonts with the viewer and record actual native wrapping, ascent
  and measured advances so selection follows the rendered text. Keep native plot
  labels rasterized and make no tagged-PDF accessibility claim.
- Await PDF completion before publishing a saved revision. Load the CommonJS PDF
  dependencies through their dynamic import's default export; a reduced probe showed
  that Maligator does not expose pdf-lib's discovered named exports on that namespace.
- Keep the library integration despite its export cost. Three interleaved fresh-process
  samples per build on AC compared the same frozen inputs with the earlier linked
  renderer. Median PNG-plus-PDF times changed from 57 to 100 ms for the control, 242 to
  368 ms for the dashboard, and 192 to 302 ms for the notebook. Peak RSS changed from
  47.3 to 77.5 MiB, 100.4 to 137.2 MiB, and 90.4 to 114.4 MiB respectively. These
  indicative comparisons include the intended font and PDF format changes.
- In five matched no-render startup samples, median `--version` time changed from
  16.1 to 17.1 ms and peak RSS from 23.0 to 28.3 MiB. This is CLI startup evidence,
  not a native idle-memory measurement.

Keep track of;

- Record native chart labeling if selectable plot text becomes necessary.
- Profile fontkit's monolithic module and generated-code cost before widening font
  support; its guarded legacy polyfills also produce compiler diagnostics.

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
