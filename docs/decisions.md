# Decisions

## 2026-11-07 native UI bindings

- Use generated C bindings for Dear ImGui and ImPlot so Maligator can compose native
  widgets directly. Keep document interpretation and application behavior in JS/TS.
- Pin each binding and its native toolkit to matching source revisions. Regenerating
  the wrappers locally failed on C++ attributes and header language handling, so consume
  the upstream-generated bindings with their matching toolkit sources.
- Keep window creation, UI calls and resource disposal on the main thread. Pass input
  buffers and chart arrays through typed FFI rather than a document-level JSON bridge.

Keep track of;

- Move the existing viewer and document renderer onto the direct bindings.
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
