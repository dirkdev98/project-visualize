# Decisions

## 2026-11-07 streamed image encoding

- Use zlib through stb's compression hook at level 3. Keep PNG pixels lossless while
  reducing compression work and file sizes for the measured artifact workloads.
- Convert RGBA to RGB in bounded native chunks and feed them directly into deflate.
  Return owned compressed bytes through the binding, avoiding a full RGB temporary
  and its JS byte loop. Keep layout, PDF text, links and outlines in Maligator JS.
- Accept the export change from seven interleaved comparisons on AC power. The 2x
  dashboard falls from 885 to 345 ms with 62 percent less CPU time; the dense table
  falls from 704 to 373 ms. Large-export peak RSS stays near baseline. Retain the
  1x notebook's roughly 5 MiB RSS increase for its 23 percent lower export latency.
- Keep idle and live-update resource measurements separate from export peaks. The
  native viewer uses about 0.1 percent of one CPU core at idle and about 3 percent
  while agents publish revisions. Physical memory ranges overlap between builds;
  this slice establishes no separate viewer CPU or memory improvement.
- Save the protocol, source and binary identities, raw samples and content checks in
  `.cache/performance-2026-11-07`. Publish the measured CPU and RAM comparisons through
  the saved performance artifacts, including the memory tradeoff and input-driver limits.

Keep track of;

- Profile PDF glyph shaping and highlighter setup after removing the raster cost.
- Measure physical scrolling and zooming when the Mac input driver can target the
  viewer reliably, and revisit memory after longer revision histories.
- Complete Linux native validation; the emulated build exceeded the bounded check.

## 2026-11-07 alpha.33 library facts

- Pin Maligator to `0.1.0-alpha.33` and describe native pointer contracts in the FFI
  configuration. Use direct wrapping, plot constructors, counted sort records,
  typed sliders and string-array ticks. This replaces the adapter exceptions from
  direct plot and text bindings and JS document rendering.
- Derive pixel-buffer bounds from width and height in the generated binding, removing
  the duplicate byte-count argument. Keep GPU capture, image ownership and platform
  event delivery native, with explicit plot-style disposal before context teardown.
- Use pdf-lib's named dynamic imports now that CommonJS re-exports are discoverable.
  Retire the parser diagnostic from matching light and dark themes after its original
  reduced input runs successfully. Keep the shared parameter sentinel type because
  it remains useful independently of the resolved inline-predicate limitation.
- Retain the font-metric accessor until pointer-only handles expose scalar fields,
  tracked in [Maligator #96](https://github.com/dirkdev98/maligator/issues/96).
  Keep constructor fields explicit while parameter properties remain unsupported,
  tracked in [Maligator #97](https://github.com/dirkdev98/maligator/issues/97).

Keep track of;

- Recheck scalar handle fields and constructor parameter properties on the next
  Maligator update.

## 2026-11-07 native interaction and visual authoring

- Use Graphite and Iris for the application and artifact palettes. Keep neutral
  surfaces and a violet accent, with distinct success and failure colors.
- Clear chart selections with an ordinary click elsewhere in the plot, committing
  on release and rejecting drags. Keep zoom controls and legends independent. This
  replaces the separate clear button from chart-driven linked selection.
- Extend document selection by words, paragraphs and Shift-click, and keep input
  shortcuts with the active field. Theme the caret explicitly and make it thicker.
  Use the toolkit callback to keep replacement pastes and clearing as single undo
  actions, and offer an input context menu without replacing the native editor.
- Use compact tooltips with delayed control hints, immediate chart details, aligned
  values and series colors. Put clearing inside search fields and copying beside code.
- Replace the grid-only diagram layout from responsive diagram spacing with graph
  layers and routed connectors. Keep sequence messages and schedules in their own
  layouts, and retain readable message lists on narrow canvases.
- Add raw-observation distributions and explicit waterfall totals. Share histogram
  boundaries across series and use interpolated quartiles with observed Tukey
  whiskers, so missing measurements cannot silently become counts or zero values.
- Broaden skill discovery to visual explanations, comparisons, trends and diagrams
  without requiring the product name. Preserve requested formats and actual app or
  website work; use a host-required image wrapper only for delivery of saved artifacts.
- Retain request timing, headers and cache metadata with image-cache assertion failures
  so another extra request identifies its creating invocation without weakening counts.

## 2026-11-07 artifact types and viewer chrome

- Require an artifact `type` of dashboard, document or diagram and copy it into
  revision metadata, so the library shows a type icon without reading every document.
  Revisions saved before the field existed show a generic icon. The document header
  label falls back from `category` to the type.
- Replace the artifact ID line in sidebar rows with the type icon, a relative update
  time and a presented dot. This replaces the presented indicators beside artifact IDs
  from the compact artifact sidebar; the ID moves to the row tooltip.
- Order projects and artifacts by latest activity, counting a presentation as activity.
  Show five artifacts per project behind Show more…, keep the selected artifact
  visible, and list every match while searching.
- Replace the Reset view row above each chart with zoom in, zoom out and fit buttons
  that appear inside the plot on hover. This replaces the explicit Reset view action
  from deliberate graph navigation. The buttons draw as an overlay that leaves layout
  unchanged, so the viewer and exports keep identical geometry.
- Give the artifact header a breadcrumb, a borderless version menu and icon actions
  with tooltips and copy feedback. Close Settings with a close button or Escape; an
  active text field keeps Escape for cancelling its edit.
- Bundle the Lucide icon font under ISC with a pinned version and checksums, so icons
  render as crisp glyphs and new ones need no drawing code.

Keep track of;

- Image cache tests occasionally see one extra HTTP request under the full parallel
  suite. Each passes alone; find whether the runtime retries requests under load.

## 2026-11-07 native settings access

- Move Mac settings access to the native application menu with Command-comma,
  replacing the sidebar button introduced with viewer settings. Reuse SDL's
  disabled preferences item so the menu has one settings command.
- Send native menu actions through a consumed application command and wake the
  event loop. Keep settings state and controls in Maligator JS. Retain Ctrl-comma
  and a sidebar Settings button on Linux.

Keep track of;

- A separate settings window needs multiple rendering surfaces; the native menu
  opens the existing settings view for now.

## 2026-11-07 compact artifact sidebar

- Replace the large branding block with a compact title and search, quiet project
  groups and rounded artifact rows. Keep presented indicators beside artifact IDs
  and keep revision selection in the document toolbar.
- Use native child-window resizing with bounded width. Save the width after
  pointer release to avoid disk writes while dragging, and keep the library path
  in a fixed footer below the scrollable artifact list.
- Retain the event-driven redraw policy. These changes establish layout and input
  behavior without claiming an accepted CPU or memory improvement.

## 2026-11-07 Linux distributions

- Replace the macOS-only packaging limit recorded in bundled agent workflow and
  viewer settings with a Linux x64 tarball and Debian package. Build against a
  Debian desktop-library baseline in an isolated container so platform-specific
  dependencies and compiler caches cannot overwrite the Mac build.
- Use SDL's Wayland and X11 handles for native wgpu surfaces. Bundle the app,
  pinned SDL and wgpu libraries with relative ELF search paths; leave glibc, the
  Vulkan loader and GPU drivers to the host. Derive Debian library dependencies
  from installed package files and normalize distribution file permissions.
- Install the Debian bundle under a stable application directory with a CLI link,
  desktop entry, icon, workflow resources and notices. Keep tarballs relocatable
  while preserving the executable's relative library and resource layout.
- Follow XDG data paths on Linux and query the desktop settings portal for capture
  appearance. Fall back to light when no dark preference is available, with
  explicit themes and saved preferences available independently of the portal.
- Include Rust and GNU time in the minimal Linux build image. The compiler's C
  job driver invokes `/usr/bin/time`, so omitting it fails after earlier build
  phases have already completed.
- Prepare a private graphics runtime directory for headless invocations when XDG
  runtime storage is absent. Set the native process environment through SDL before
  graphics workers start; the runtime's JS environment object is a snapshot.
- Resolve the physical executable through platform APIs so PATH aliases can find
  bundled libraries and resources. The runtime's executable path can contain only
  the invocation name, which cannot be resolved as a file in the caller's directory.
- Use Mesa software Vulkan and isolated X11/Wayland sessions for Linux rendering
  verification. This does not establish physical GPU compatibility or performance.

Keep track of;

- Expose GNU time as a checked native-build prerequisite upstream.
- Resolve the operating-system executable path and support live process environment
  updates upstream.
- Investigate development-runner startup under emulated Linux x64. A console-only
  entry stalls after readiness with unchanged FFI configuration; production builds
  complete and can be verified independently.
- Verify Linux ARM64 releases before distributing that architecture.
- Adapt stable CLI and skill installation paths before adding AppImage or Flatpak.
- Verify desktop interactions on physical Linux GPUs.

## 2026-11-07 viewer settings

- Add persistent System, Light and Dark appearance choices and a scroll-speed
  setting. Follow SDL's current system theme on viewer wakes; resolve the macOS
  command-line capture default once through system preferences. Keep explicit
  document and command themes available.
- Retain the effective creation theme in revision metadata so changing preferences
  cannot change a saved revision's default export palette. Let the viewer follow
  current appearance independently of that creation-time choice.
- Add Install CLI and Link skill actions with editable, visible destinations and
  copyable shell commands. Reuse non-destructive linking, preserve shared source
  links and show a PATH command when the selected directory is absent from PATH.
- Keep native packaging limited to macOS. The embedded workflow is portable data;
  it does not establish runtime support on another platform.

## 2026-11-07 deliberate graph navigation

- Default Mac wheel input to 20 percent and expose an adjustable speed. Reserve
  graph wheel zoom for Command on Mac and Ctrl elsewhere, allowing ordinary wheel
  input to scroll the document. Add an explicit Reset view action alongside native
  double-click fitting.
- Accumulate SDL's relative pinch events once per frame. Keep pointer-centered
  range calculation in Maligator through plot-coordinate bindings, preserving
  inverted-axis transforms. Keep event delivery and pointer-owned input maps in
  the native bridge.
- Clear ImPlot's default Ctrl drag-source override because it suppresses the new
  zoom modifier. Use ImGui's normalized Ctrl for physical Mac Command.
- Verify native input and the real viewer controls offscreen in development and
  production. This establishes application behavior, without a performance claim
  or acceptance of physical trackpad delivery or Mac scroll feel.

Keep track of;

- Confirm physical pinch delivery and the adjusted scrolling feel in an unlocked
  Mac session with a trackpad.

## 2026-11-07 current-layout exports

- Render export requests from saved documents and retained image bytes rather
  than copying creation-time derivatives. This lets existing artifacts receive
  corrected category layout while preserving every saved revision file.
- Default exports to 2x density as well as new renders. Retain explicit scale and
  width overrides, and retain creation-time snapshots for exact historical bytes.
  Rendering costs more than copying a file; this is a quality decision rather
  than an accepted performance improvement.

## 2026-11-07 presented artifact versions

- Mark the exact saved revision selected for delivery rather than every rendering
  attempt. Keep the current presentation and prior delivery timestamps in an atomic
  artifact-level sidecar, outside immutable revision directories.
- Expose presentation state through the CLI and revision menu. Follow the current
  presentation by default, retain an explicit latest-draft mode, and include marker
  changes in viewer refresh detection even when no new revision was created.
- Teach the shared skill to inspect both captures, mark its selected revision and
  then return its screenshot. This records declared delivery rather than a receipt
  that the person read it.

## 2026-11-07 bundled agent workflow

- Embed the skill, guide and fictional examples in the executable and include a
  readable bundle alongside the packaged CLI and desktop application. Describe the
  executable and resource locations in a bundle manifest so linked installations
  resolve physical paths without assuming the checkout layout.
- Expose extraction and non-destructive CLI and skill linking through the CLI.
  Preserve occupied destinations, make identical links idempotent, and quote copied
  shell commands. Settings can use the same operations with visible destinations.
- Keep resource bundling independent of platform. Native packaging remains macOS
  only; embedded resources do not establish another platform's runtime compatibility.

## 2026-11-07 desktop and phone captures

- Default new screenshots to 2x density, retaining explicit single-density rendering.
  Let agents save a phone PNG alongside the desktop PNG and PDF in one atomic,
  immutable revision, and return named screenshot paths with logical dimensions.
- Support phone widths with smaller canvas margins, responsive titles and stacked
  records for wide data and Markdown tables. Preserve field content, numeric sorting
  and formatted search across layout changes rather than shrinking columns into
  unreadable text.
- Give tables explicit local cell padding and outer horizontal padding so headers
  do not inherit container-dependent spacing. Use the same bold header face in the
  viewer and exports, retaining native sorting behavior and repeated PDF headings.
- Keep captures sequential. Doubling density uses four times as many raster pixels,
  so retain GPU bounds and the single-density option for very tall documents. This
  changes capture quality and cost without an accepted memory or speed improvement.

## 2026-11-07 responsive categorical bars

- Use measured adjacent-label widths to switch crowded categorical bar charts to
  horizontal rows. Swap display axes while keeping data and typed categories in
  their original order. Let row height follow wrapped labels, with a bounded figure
  height and thinned ticks for very large comparisons.
- Keep plot identities and fitting state separate by orientation so responsive
  changes cannot reuse ranges from exchanged axes. Transpose linked hit testing,
  zero-value tolerance and selection bands with the display, and cancel a pending
  selection if its orientation changes.
- Keep the layout and plot styling in Maligator JS through existing ImPlot bindings.
  Preserve saved revisions and use fictional observation sites for the shared
  example. This improves readability without a performance-win claim.

## 2026-11-07 linked skill discovery

- Resolve the physical shared-skill directory before deriving the application
  checkout. Use its absolute CLI, guide and example paths while retaining the
  caller's working directory for artifact inputs and outputs.
- Make the CLI wrapper follow relative and absolute symlink chains as well. A PATH
  link should invoke the built application without depending on a launcher alias's
  parent directory or changing the caller's project.

## 2026-11-07 direct plot and text bindings

- Move chart dispatch, styling and line-break assembly out of C++. Call the generated
  line, bar, scatter and shaded-series bindings directly from Maligator JS, and use
  the native font measurement binding for exact advances. Open links through SDL's
  generated binding rather than a project wrapper.
- Cache copied plot styles per renderer and dispose them on theme changes or renderer
  teardown. Keep a native default-value factory because the library's constructor
  returns pointer storage while its plot APIs consume copied values. Do not pass
  those copied values to the library's pointer-deleting destructor.
- Retain a small wrap adapter for the required pointer to the end of the same input
  string. Passing null to the direct native wrap API failed the differential check;
  the bounded adapter preserves exact wrapping while JS handles line breaks,
  whitespace and Unicode progress. The replacement matches the previous renderer's
  advances and consumed text across the font and width matrix.
- Keep GPU resource lifetime, foreign-thread errors, image decoding and platform
  event delivery native. A complete migration needs explicit ownership for nested
  descriptors and callbacks, plus binding support for the remaining pointer shapes.
  This slice establishes behavior parity without an accepted performance-win claim.
- Confirm the GPU boundary with the installed binding inspector: caller-owned
  adapter and device callback records are pointers, while the corresponding WebGPU
  request functions require records by value. Keep this as an upstream binding gap
  rather than adding casts or exposing unowned callback storage.

## 2026-11-07 remote image snapshots

- Accept HTTP(S) image sources alongside local PNG/JPEG assets. Resolve them in
  Maligator JS before publishing a revision, and copy the selected bytes into that
  revision so viewing and export remain reproducible offline.
- Reuse fresh cache entries and serve stale bytes while conditional ETag or
  Last-Modified requests refresh future renders. Publish URL metadata atomically
  over content-addressed blobs so concurrent agents cannot mix validators and bytes.
  Respect no-store and required validation, bound request time and response size,
  and keep a failed stale refresh separate from a failed cold download.
- Settle refreshes before the CLI exits. Background refresh overlaps artifact work
  but can extend command completion; this is a freshness feature without a measured
  performance-win claim. Saved revisions never adopt refreshed bytes silently.

Keep track of;

- Add cache eviction if retained remote images become a material storage cost. The
  cache is disposable independently of the immutable version store.

## 2026-11-07 native document text selection

- Let people select rendered text across headings, prose, code and table cells. Keep
  hit testing, Unicode boundaries, drag state, clipping and clipboard assembly in
  Maligator JS using measured native glyph positions. Preserve source whitespace
  across soft wraps and clear selections when the displayed content changes.
- Keep selection scoped to the document canvas. Editable controls retain keyboard
  ownership, links activate only without a selection drag, and dragging beyond the
  viewport scrolls the document. Disable movement of the fixed ImGui root window.
- Keep exports free of selection state. The new viewer geometry work runs only on
  redraws; make no performance claim without a matched measurement. Physical macOS
  input remains distinct from offscreen native input verification.

## 2026-11-07 compact decision brief

- Add a briefing example that keeps the finding, trend, uncertainty and source rows
  together on a landscape page. Use an asymmetric composition and authored table
  proportions so the evidence remains readable beside the decision.
- Keep totals and availability consistent with the fictional source rows. Preserve the
  matching dark appearance, and use portrait paper when the narrow layout stacks its
  content across pages.

## 2026-11-07 desktop document navigation

- Accept PDF bookmarks for desktop document navigation after verifying their Unicode
  hierarchy and destinations in Preview. Preserve the reader's zoom while navigating
  between sections, including headings following continued evidence tables.
- Keep the native viewer outline as a separate improvement. Its collapsed sections
  and changing canvas layout require their own stable navigation model.

## 2026-11-07 refreshed artifact examples

- Save the current fictional examples into the local example library through the CLI
  so the desktop app exposes linked dashboards, document widgets and new chart forms.
  Preserve every existing revision and its saved files when adding these examples.
- Inspect the complete viewer composition with its current controls and code actions
  across light, dark, narrow and Retina layouts. Keep offscreen input evidence distinct
  from physical macOS interaction checks.

## 2026-11-07 final viewer idle evidence

- Refresh the current JS viewer comparison at `f936a7b` against the original production
  app at `fafe3f4`. Use the same immutable dashboard and focused 2880 x 1898 Retina
  window, with three fresh processes per build in interleaved order, at least ten-second
  warmups and fifteen-second samples on AC power. Inspect every before/after screenshot
  and retain binary identities and raw samples without observed compiler contention.
- Median CPU is 9.433% versus 0.112% of one core, about 84x lower. Median physical
  footprint is 239.0 versus 100.8 MiB, about 2.4x lower; current samples span
  100.7..126.3 MiB. Median RSS is higher, 111.0 versus 142.1 MiB. The 10x RAM target
  remains unmet.
- Accept this as indicative laptop evidence for the current whole application. It
  replaces **JS viewer idle acceptance** for the current source. It does not isolate
  the migration or establish an incremental gain from later visual changes. Keep export peak
  memory measurements separate from native idle footprint.

## 2026-11-07 table column proportions

- Let authors give table columns positive relative weights, using equal shares when
  omitted. Keep the proportions in the saved document and pass them to native stretch
  columns in both the viewer and exports. Give prose and long headings room without
  changing the data or introducing width heuristics.
- Use calibrated proportions in the linked dashboard so its narrow table retains
  whole headings. Preserve raw numeric sorting, raw and formatted searches, selected
  rows and selectable PDF content across the layout change.

## 2026-11-07 compact code actions

- Align the viewer's language label and Copy code action on one header row when
  their measured widths fit. Stack the action in narrow panels and use a regular
  native button so the compact treatment retains a practical click target.
- Keep the export header and code layout unchanged. Verify exact PNG/PDF parity
  across examples and real queued copy actions in development and production,
  preserving Unicode, tabs and CRLF from independent blocks.

## 2026-11-07 responsive diagram spacing

- Place automatic nodes at full grid-cell centers. The earlier inset compressed
  adjacent centers and overlapped nodes at intermediate canvas widths.
- Measure connector labels before choosing a grid or vertical flow. Leave room between
  node boxes for their labeled arrows, and expand multirow grids instead of squeezing
  more rows into a fixed height. Retain normalized explicit positions in the grid.
- Keep geometry in JS and use the existing native drawing operations. Inspect light,
  dark, narrow, intermediate, explicit and multirow exports, retaining selectable
  node and edge labels. This is a layout correction without a performance-win claim.

## 2026-11-07 titled PDF sections

- Keep a block title with its first rendered content line when a card, callout,
  expanded section or other titled block spans pages. Capture the body line locally
  after the title so nested and parallel branches keep their own content.
- Add a short preferred span instead of making an oversized container indivisible.
  Whole-container preferences can exceed a page and were leaving a timeline card's
  title alone. Let timelines flow between protected events so the title and whole
  timeline do not form an oversized chain. Preserve the text-first column fallback.
- Keep continuous layout unchanged and verify exact PNG parity across the example
  matrix. A public CLI regression reproduces the old orphan and checks the title's
  association with its first event in light and dark exports.

## 2026-11-07 readable visual defaults

- Darken the light theme's warning and clay series colors while retaining the slate,
  teal and blue direction. Their calculated contrast against white rises from 3.80 to
  4.99 and 2.38 to 3.60 respectively; this is a palette check, not a compliance claim.
- Show rounded percentages with progress labels so empty, partial and complete values
  remain clear without estimating bar lengths.
- Increase code text and line spacing for chat-sized screenshots. Preserve the original
  source in copy and selectable PDF text. The readability fixture grows from 558 to
  576 logical units at wide sizes and 619 to 640 at narrow sizes; accept the extra
  space without a performance claim.
- Retain Shiki's matching light and dark themes. A suspected theme mismatch was not
  reproduced: development and production probes switch light, dark and light correctly,
  and the rendered light glyph colors agree with the light palette after antialiasing.

## 2026-11-07 compact inspection context

- Give linked-control values the first part of Context, using compact label/value
  rows and readable range bounds. Keep scalar types visible and leave copied parameter
  JSON unchanged. The stacked pane can show the controls together instead of spending
  most of its height on repeated revision metadata.
- Retain the short revision in the pane and show the full artifact identity and local
  date on hover. Keep source context below the control summary and independently
  scrollable, with the same arrangement in light and dark themes.

## 2026-11-07 responsive chart legends

- Place short ordinary legends beneath the plot using measured label widths. Keep
  data visible through line and area charts, while retaining the inset fallback for
  long ordinary legends so they cannot squeeze away the plot.
- Preserve outside legends for linked selection charts. Own placement in the shared
  layout, keep series visibility interactive, and disable legend placement menus that
  would conflict with the responsive position on the next frame.
- Verify native legend hide/show, pan, zoom and refit alongside typed bar selection
  and drag cancellation. Inspect the light, dark, narrow and long-label exports;
  this changes chart composition without a performance-win claim.

## 2026-11-07 empty table recovery

- Explain whether a table's current view has no rows or its local search has no
  matches. Keep the empty-view message in exports so a header-only table cannot look
  like missing rendering work.
- Offer Clear search for a failed local query. Clear its state and native input
  buffer together, retaining the current sort and linked parameters. Verify typing
  again after recovery so an old native buffer cannot silently restore the failed query.

## 2026-11-07 reproducible viewer selections

- Add Copy view for sharing the displayed revision, current theme and typed linked
  parameters with an agent. Include the absolute library path so a view from a separate
  store can be reproduced through the CLI. Preserve scalar types, range bounds and
  the explicit all-values sentinel instead of copying display labels.
- Show linked-control values in Context and clarify that the PNG action copies the
  saved revision's snapshot path. Keep copying a view separate from publishing a new
  artifact; inspection and themed parameter exports preserve existing saved files.
- Verify the actual native button and clipboard through the offscreen viewer adapter,
  including typed categories, partial ranges and Follow latest. Round-trip copied
  selections through the CLI, and check toolbar wrapping and independent Context
  scrolling at narrow and Retina sizes. Keep physical SDL delivery separate.

## 2026-11-07 shaded trends

- Compose area charts from a shaded numeric series and its line in JS. Share the
  series identity so the legend controls both, and vary restrained opacity with the
  light and dark palettes. Each area extends to zero independently, including signed
  values; its baseline participates in fitting rather than disappearing below a
  positive-only axis range.
- Keep the native addition limited to one synchronous shaded-plot operation over
  borrowed numeric arrays. Reuse the existing data transforms, typed parameters,
  legends and navigation. Preserve exact PNG/PDF bytes for existing chart kinds and
  make no performance-win claim for the extra plotting operation.
- Keep the trend example's figure and caption compact enough for a narrow landscape
  page. Oversized fixed-height figures still require author choices about height or
  paper orientation; shortening the example avoids orphaned titles and captions.

Keep track of;

- Recheck header-comment extraction when updating Maligator. Generated declarations
  inherit the preceding capture comment on unrelated native functions; the source
  header carries the actual ownership contracts.

## 2026-11-07 PDF navigation

- Add Unicode bookmarks for rendered block titles and Markdown headings. Capture
  their actual positions and explicit container parents during the final export
  pass, then map them through the same page and repeated-header offsets as selectable
  text. Preserve continuous PNG bytes and leave the PDF reader's zoom and page mode alone.
- Keep a fresh heading hierarchy for each Markdown block and nested branch. Preserve
  document traversal order through parallel columns, including duplicate titles;
  neither vertical sorting nor one global heading-depth stack preserves that structure.
- Keep this in JS with the existing PDF library. Write bookmark titles as Unicode
  strings, link parents and siblings explicitly, and count descendants for expanded
  navigation. Check destinations against the actual extracted heading glyphs at both
  export densities, including headings following continued tables.

Keep track of;

- Consider a native document outline with stable heading identities and automatic
  opening of collapsed ancestors. Cached screen coordinates cannot resolve those jumps.

## 2026-11-07 JS viewer idle acceptance

- Replace the visible-window deferral in JS renderer performance cost with a matched
  comparison of the original production viewer and the current JS production app.
  Use the same saved dashboard revision and Retina window, verify its visible focused
  content before and after every sample, and retain screenshot and binary identities.
- Three interleaved fresh processes per build, warmups of at least ten seconds and
  fifteen-second samples on AC give median CPU use of 9.738% versus 0.181% of one
  core, about 54x lower. Ranges are 9.477..9.743% and 0.151..0.197%. A compiler
  observer finds no contention. These indicative laptop results are sufficient to
  accept the retained event-driven CPU improvement in the richer JS viewer.
- Median physical footprint is 238.9 versus 104.3 MiB, about 2.3x lower; RSS is
  110.4 versus 142.0 MiB. Keep those measures distinct. The 10x RAM target remains
  unmet, and this complete product comparison does not isolate the cost of moving
  behavior into JS from the new fonts, widgets and document capabilities.
- Keep physical chart input and revision-switch resource acceptance separate. The
  screenshot and idle checks establish visible rendering, while queued native input
  checks establish widget behavior without proving SDL pointer delivery.

## 2026-11-07 authored PDF sections

- Let a top-level block request a fresh PDF page with `pageBreakBefore`. Keep this
  as capture metadata so viewer and PNG composition stay continuous and byte-identical.
  Continue automatic pagination within sections and retain each table's continuation
  heading only while that table has rows left.
- Reject nested breaks because raster pagination cuts across every column. A break
  before the first body block creates a title-only cover. Ignore boundaries with no
  following content so trailing padding cannot become a blank final page.
- Place boundaries just before the next block's antialiased edge. Keep that guard
  separate from the content test; visual checks exposed a one-unit trailing page when
  a flagged spacer followed the last evidence block.

## 2026-11-07 numeric table presentation

- Align numeric columns to the right and allow an explicit alignment override.
  Share decimal, prefix and suffix formatting with metrics while retaining raw cell
  types for sorting, linked calculations and saved data. Search both visible and raw
  values so either representation finds the evidence.
- Cache display strings and measured numeric widths for the current resolved view.
  Clear them on parameter changes and renderer disposal, keeping formatting and
  measurement out of repeated frames without retaining prior selections.
- Retain this for readability without a speed claim. Five interleaved fresh-process
  samples per build preserve document height and selectable PDF content; intentional
  alignment changes the raster. Median dense-table export time is 936 versus 922 ms
  and peak RSS is 172.3 versus 172.9 MiB, with the small control and notebook also
  effectively unchanged. These indicative AC laptop measurements cover export cost,
  not native idle footprint.

## 2026-11-07 viewer library and responsive controls

- Show artifact IDs beneath compact titles so equally named artifacts remain distinct.
  Keep user titles separate from native widget IDs, draw their text inside one reserved
  selectable row, and expose the full title through a wrapping tooltip.
- Wrap toolbar actions using the shared frame padding and item spacing. Stack Context
  beneath the canvas when a side panel would crowd it, keeping both panes inside the
  viewport and independently scrollable.
- Show local revision dates and short IDs, and expose Follow latest in the version
  menu. Choosing a specific revision freezes that snapshot; following selects new
  immutable versions as the existing refresh loop discovers them. Hide empty project
  groups during search and provide a clear-search action when nothing matches.
- Verify composition and queued input with a private offscreen adapter around the
  unchanged viewer draw, selection and refresh code. Check real-time refresh with new
  CLI revisions in both build modes, and keep physical SDL input, window recovery and
  idle measurements as separate acceptance work.

Keep track of;

- Consider a native accessibility bridge. Mac automation currently exposes window
  controls while the artifact widgets are drawn by ImGui.

## 2026-11-07 chart fitting and selection gestures

- Add modest fit padding in the shared theme so line endpoints and scatter markers
  stay inside the plot. Apply the supplied series color to marker edges and faces as
  well as lines and fills; ImPlot derives a scatter legend's identity from its marker
  edge color, which previously fell back to the colormap.
- Reserve Shift input for category selection. ImPlot fits on a double-click with any
  modifier, which can move a panned bar between press and release and prevent clearing.
  Suspend its plot input while Shift is held and use the clipped plot rectangle and
  native window hover for selection. Keep plain pan, wheel zoom and double-click fit.
- Keep selection-chart configuration agent-owned while the legend controls series
  visibility. Verify rapid repeat selection after panning and native legend hide/show
  separately, so a legend click cannot select the data underneath it.

## 2026-11-07 linked comparison context

- Replace the self-filtering behavior of chart-driven selection with comparison bars.
  A driving chart ignores only its own control ID; every other control still applies,
  including another control on the same field. Other widgets retain the complete
  selected filter. Keep raw scalar categories and sparse series intact.
- Draw a faint clipped band behind the chosen category and include a selection caption
  in exports. An absent category leaves comparison data visible while linked evidence
  is empty, with no false highlight. Repeating a bar clears it, and another bar replaces it.
- Resolve chart fit signatures from their relevant parameters when the view changes.
  Exclude the driving control so its selection preserves a user's pan and zoom.
  Keep the plot and legend together separately from the caption when they fit a PDF page.

Keep track of;

- Consider print-specific figure fitting for narrow fixed-height layouts. A 310-unit
  chart nearly fills a landscape PDF page at a 480-unit canvas width, so its card title
  and caption can continue separately. Portrait paper or shorter figures avoid that case.

## 2026-11-07 caller-owned capture acceptance

- Accept the caller-owned capture checkpoint for lower peak memory on larger exports.
  Five interleaved fresh-process samples per build on AC preserve exact PNG and PDF
  bytes. A process observer found no compiler contention during the complete pass.
- Median peak RSS falls from 214.6 to 172.6 MiB for the dense table, 190.0 to 160.9 MiB
  for the 2x notebook, and 137.6 to 126.7 MiB for the dashboard. The small control and
  1x notebook remain effectively unchanged. These indicative laptop measurements are
  sufficient to retain the change; they measure export peak RSS, not idle footprint.
- Make no material speed claim. Median export times change from 996 to 984 ms for
  the dense table, 697 to 695 ms for the 2x notebook, 412 to 402 ms for the dashboard,
  344 to 341 ms for the notebook, and 121 to 114 ms for the control. The no-render
  startup control remains about 20 ms and 28 MiB.

## 2026-11-07 Markdown section boundaries

- Keep Markdown headings with the first following body line in PDF pagination.
  Carry consecutive headings through intervening whitespace and reference definitions,
  and scope the preference to each recursive block list so separate columns and list
  branches cannot become connected.
- Keep this a layout preference. Oversized groups may split, and conflicting parallel
  sections still yield to intact glyph lines. Preserve the continuous viewer and PNG
  layout; the narrow report uses another PDF page rather than orphaning its headings.

## 2026-11-07 framed image layouts

- Keep natural image sizing and add full-width frames with contained or centered
  cropped content. Own frame geometry, UV coordinates, layout advancement and theme
  colors in JS; keep the native operation limited to drawing a rounded textured quad.
- Preserve the complete source in letterboxed frames. Disable rounding on tiny quads
  because the pinned path builder subtracts an inset after its radius clamp. Reserve
  antialiasing padding inside the image's layout bounds so PDF cuts leave no edge on
  the preceding page or pull neighboring panels into the protected region.
- Keep image resources alive through drawing and capture, then release them before
  GPU teardown. Reuse the native probe runner for sampling and borrowed readback checks.

Keep track of;

- Recheck FFI documentation association upstream. Generated declarations attach the
  capture buffer comment to unrelated functions; their signatures remain correct.

## 2026-11-07 macOS command shortcuts

- Use ImGui's Control modifier for application command shortcuts. Its macOS input
  behavior swaps physical Command and Control, so the previous Super bindings
  responded to Control despite advertising Command.
- Verify Command+K search and repeated Command+Shift+L theme changes in the native
  viewer after reproducing the prior Control behavior. The hide/restore presentation
  check also passes again with one retained UI frame. Keep pointer-based chart
  acceptance separate from keyboard and offscreen input checks.

## 2026-11-07 linked document heatmaps

- Render heatmaps as JS-owned native tables with a restrained sequential palette,
  contrasting numeric text and explicit missing-cell labels. Preserve real zeros,
  typed categories and absent pairs. Keep axes and inferred color bounds tied to the
  original snapshot while controls filter the observations.
- Support static matrices and dataset aggregates. Split wide grids into column bands
  on narrow canvases, repeat row labels in each band, and reuse table capture for
  selectable PDF values and continued headings. Keep this document widget passive;
  dense pannable plots and cell-driven selection can use a separate interaction design.
- Return a resolved view for static documents as well as linked ones, so inspection
  exposes inferred heatmap bounds consistently with rendering.
- Omit trailing PDF pages that contain only blank canvas. Preserve visible dividers
  in the recorded bounds. A narrow capture exposed the padding spill, and the public
  regression fails on the prior build while the corrected page retains all content.

## 2026-11-07 document font behavior

- Retain fontkit's shaping and subsetting while profiling its cost. Disabling ligatures
  and kerning still leaves composition and mark processing, so a precomputed codepoint
  lookup would weaken the text contract. Baked fixture-only runs could bound the
  potential benefit without qualifying as a replacement for general document text.

## 2026-11-07 caller-owned capture checkpoint

- Fill a JS-owned writable byte view directly from mapped GPU rows. Remove the native
  RGBA vector, return allocation and FFI return copy. Keep the borrow synchronous and
  retain ownership in JS so encoding can run after GPU teardown.
- Validate the exact destination length before writing. Keep mapped resources scoped
  to capture and callback status alive through their disposal. Use atomic status for
  the callback mode's permitted cross-thread delivery.
- Preserve production builds before and after this change for a matched comparison.
  The self-compilation benchmark running in another session prevents an uncontended
  timing pass. Treat this as a functional checkpoint without a performance claim.

## 2026-11-07 chart-driven linked selection

- Let dataset-bound bars target a matching select control with `select`. Shift-click
  selects the raw category; repeating it clears the filter. Keep numeric categories,
  text and null distinct, including sparse grouped series and forward control references.
  Expose the typed categories through CLI inspection for reproducible parameter exports.
- Commit selection on release and cancel it for a changed view, released modifier or
  drag. Check both native drag history and release-frame movement so dragging out and
  back cannot select a bar. Keep legends outside the plot and disable their relocation
  menu so series toggles cannot hit data underneath.
- Retain native pan, wheel zoom and double-click fitting. A private probe adds only
  read-only public ImPlot observations to the JS renderer and drives actual ImGui input
  through borrowed FFI handles. Development and production checks cover selection,
  clearing, cancellation and chart navigation without inferring physical SDL input.

Keep track of;

- Verify Shift-click and legend interaction with the physical macOS pointer when the
  native window is available to automation.

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
