import {
  ImDrawList_AddText_FontPtr,
  ImGuiChildFlags_Borders,
  ImGuiInputFlags_RouteGlobal,
  ImGuiKey_K,
  ImGuiKey_L,
  ImGuiMod_Ctrl,
  ImGuiMod_Shift,
  ImGuiTreeNodeFlags_DefaultOpen,
  ImGuiWindowFlags_NoDecoration,
  ImGuiWindowFlags_NoSavedSettings,
  igBegin,
  igBeginChild_Str,
  igBeginCombo,
  igBeginGroup,
  igButton,
  igCalcTextSize,
  igCollapsingHeader_TreeNodeFlags,
  igEnd,
  igEndChild,
  igEndCombo,
  igEndGroup,
  igGetContentRegionAvail,
  igGetCursorScreenPos,
  igGetItemRectMax,
  igGetWindowDrawList,
  igIsItemHovered,
  igPopFont,
  igPopID,
  igPushFont,
  igPushID_Str,
  igRender,
  igSameLine,
  igSelectable_Bool,
  igSetClipboardText,
  igSetKeyboardFocusHere,
  igSetNextItemWidth,
  igSetNextWindowPos,
  igSetNextWindowSize,
  igShortcut_Nil,
  igSpacing,
  pv_open_url,
  pv_surface_begin,
  pv_surface_close,
  pv_surface_input,
  pv_surface_open,
  pv_surface_present,
  pv_surface_size,
  pv_surface_wait,
} from "maligator:ffi/visualize";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { controls, isAll, parameterValue } from "./data.ts";
import type { Theme } from "./model.ts";
import { type Entry, list, load } from "./store.ts";
import {
  DocumentRenderer,
  type DocumentState,
  documentState,
} from "./ui/content.ts";
import {
  available,
  checked,
  input,
  inputBuffer,
  inputValue,
  releasePanels,
  text,
  tooltip,
} from "./ui/primitives.ts";
import {
  currentTheme,
  type Font,
  fonts,
  framePadding,
  initializeTheme,
  itemSpacing,
  packed,
  palette,
  popTheme,
  pushTheme,
  setTheme,
} from "./ui/theme.ts";

function compactLabel(
  value: string,
  width: number,
  size: number,
  font: Font,
): string {
  const face = fonts[font];
  if (!face) throw new Error("Fonts are not initialized");
  const label = value.replace(/\s+/g, " ");
  igPushFont(face, size);
  try {
    if (igCalcTextSize(label, false, -1).x <= width) return label;
    const room = width - igCalcTextSize("…", false, -1).x;
    if (room < 0) return "";
    const points = Array.from(label);
    let low = 0,
      high = points.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (igCalcTextSize(points.slice(0, mid).join(""), false, -1).x <= room)
        low = mid;
      else high = mid - 1;
    }
    return `${points.slice(0, low).join("")}…`;
  } finally {
    igPopFont();
  }
}
function revisionDate(entry: Entry, full = false): string {
  const date = new Date(entry.createdAt);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const time = [date.getHours(), date.getMinutes()];
  if (full) time.push(date.getSeconds());
  return `${date.getDate()} ${months[date.getMonth()]}${full ? ` ${date.getFullYear()}` : ""} · ${time.map((part) => String(part).padStart(2, "0")).join(":")}`;
}

interface Options {
  project?: string;
  artifact?: string;
  version?: string;
  parameters?: unknown;
  theme?: Theme;
}
export function openViewer(root: string, options: Options) {
  let entries = list(root);
  let selected = entries.find(
    (entry) =>
      (!options.project || entry.project === options.project) &&
      (!options.artifact || entry.artifact === options.artifact) &&
      (!options.version || entry.version === options.version),
  );
  const initialDirectory = selected?.directory;
  let followLatest = options.version === undefined;
  let loaded = "",
    error = "";
  let renderer: DocumentRenderer | undefined;
  let previous = entries.map((entry) => entry.directory).join("\n");
  let refreshed = Date.now();
  let pending = 2,
    animateUntil = 0,
    showContext = false;
  let unpresented = false;
  let themeOverride = options.theme;
  let requestedTheme: Theme | undefined;
  const search = inputBuffer();
  const states = new Map<string, DocumentState>();
  function select(entry: Entry | undefined, follow: boolean) {
    selected = entry;
    followLatest = follow;
    if (!entry || entry.directory !== loaded || !renderer) {
      renderer?.dispose();
      renderer = undefined;
      loaded = "";
      if (!entry) {
        error = "";
        pending = 2;
        return;
      }
      try {
        const document = load(entry);
        requestedTheme = themeOverride ?? document.theme ?? "light";
        const state =
          states.get(entry.directory) ??
          documentState(
            document,
            entry.directory === initialDirectory
              ? options.parameters
              : undefined,
          );
        states.set(entry.directory, state);
        renderer = new DocumentRenderer(document, state);
        loaded = entry.directory;
        error = "";
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }
    }
    pending = 2;
  }
  function refresh() {
    if (Date.now() - refreshed < 2000) return;
    try {
      const current = selected;
      entries = list(root);
      const signature = entries.map((entry) => entry.directory).join("\n");
      if (signature !== previous) {
        const entry = followLatest
          ? entries.find((entry) =>
              current
                ? entry.project === current.project &&
                  entry.artifact === current.artifact
                : (!options.project || entry.project === options.project) &&
                  (!options.artifact || entry.artifact === options.artifact),
            )
          : entries.find((entry) => entry.directory === current?.directory);
        previous = signature;
        select(entry, followLatest);
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      pending = 2;
    }
    refreshed = Date.now();
  }
  function draw() {
    const size = pv_surface_size();
    igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
    igSetNextWindowSize(size, 0);
    igBegin(
      "Visualize",
      ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoSavedSettings,
    );
    // ImGui maps Command to Ctrl when its macOS behavior is enabled.
    const focusSearch = igShortcut_Nil(
      ImGuiMod_Ctrl | ImGuiKey_K,
      ImGuiInputFlags_RouteGlobal,
    );
    igBeginChild_Str("library", { x: 244, y: 0 }, ImGuiChildFlags_Borders, 0);
    text("PROJECT", 11, "bold", palette.accent);
    text("Visualize", 32, "bold");
    text("Your artifact library", 14, "regular", palette.muted);
    if (
      igButton(currentTheme() === "light" ? "Dark theme" : "Light theme", {
        x: 0,
        y: 0,
      }) ||
      igShortcut_Nil(
        ImGuiMod_Ctrl | ImGuiMod_Shift | ImGuiKey_L,
        ImGuiInputFlags_RouteGlobal,
      )
    ) {
      themeOverride = currentTheme() === "light" ? "dark" : "light";
      requestedTheme = themeOverride;
      pending = 2;
    }
    igSpacing();
    igSetNextItemWidth(-1);
    if (focusSearch) igSetKeyboardFocusHere(0);
    input("##find", "Find an artifact…", search);
    igSpacing();
    const query = inputValue(search).trim().toLowerCase();
    const groups = new Map<string, Map<string, Entry>>();
    for (const entry of entries) {
      let group = groups.get(entry.project);
      if (!group) {
        group = new Map();
        groups.set(entry.project, group);
      }
      if (!group.has(entry.artifact)) group.set(entry.artifact, entry);
    }
    let matches = 0;
    for (const project of [...groups.keys()].sort()) {
      const artifacts = groups.get(project);
      if (!artifacts) continue;
      const visible = [...artifacts.keys()].sort().filter((artifact) => {
        const entry = artifacts.get(artifact);
        return (
          entry &&
          (!query ||
            `${project} ${artifact} ${entry.title}`
              .toLowerCase()
              .includes(query))
        );
      });
      if (!visible.length) continue;
      matches += visible.length;
      if (
        !igCollapsingHeader_TreeNodeFlags(
          project,
          ImGuiTreeNodeFlags_DefaultOpen,
        )
      )
        continue;
      for (const artifact of visible) {
        const entry = artifacts.get(artifact);
        if (!entry) continue;
        const active =
          selected?.project === project && selected?.artifact === artifact;
        const start = igGetCursorScreenPos(),
          width = available();
        const clicked = igSelectable_Bool(
          `##${project}/${artifact}`,
          active,
          0,
          { x: 0, y: 52 },
        );
        const hovered = igIsItemHovered(0),
          draw = igGetWindowDrawList();
        if (!draw || !fonts.bold || !fonts.regular)
          throw new Error("Cannot access the library canvas");
        ImDrawList_AddText_FontPtr(
          draw,
          fonts.bold,
          16,
          { x: start.x + 8, y: start.y + 5 },
          packed(palette.ink),
          compactLabel(entry.title, width - 16, 16, "bold"),
          0,
        );
        ImDrawList_AddText_FontPtr(
          draw,
          fonts.regular,
          13,
          { x: start.x + 8, y: start.y + 29 },
          packed(palette.muted),
          compactLabel(artifact, width - 16, 13, "regular"),
          0,
        );
        if (hovered) tooltip(`${entry.title}\n${project} / ${artifact}`);
        if (clicked) select(entry, true);
      }
    }
    if (!entries.length)
      text(
        "Render an artifact with the CLI to start your library.",
        16,
        "regular",
        palette.muted,
      );
    else if (!matches) {
      text("No artifacts match this search.", 16, "regular", palette.muted);
      if (igButton("Clear search", { x: 0, y: 0 })) {
        search.fill(0);
        pending = 2;
      }
    }
    igEndChild();
    igSameLine(0, -1);
    igBeginGroup();
    if (selected) {
      const toolbarStart = igGetCursorScreenPos(),
        toolbarRight = toolbarStart.x + available();
      const versionWidth = Math.max(1, Math.min(235, available()));
      let toolbarEnd = toolbarStart.x + versionWidth;
      function toolbarButton(label: string): boolean {
        const width = igCalcTextSize(label, false, -1).x + framePadding.x * 2;
        if (toolbarEnd + itemSpacing.x + width <= toolbarRight)
          igSameLine(0, -1);
        const clicked = igButton(label, { x: 0, y: 0 });
        toolbarEnd = igGetItemRectMax().x;
        return clicked;
      }
      const latest = entries.find(
        (entry) =>
          entry.project === selected?.project &&
          entry.artifact === selected?.artifact,
      );
      const shortVersion = selected.version.slice(-8);
      const preview = followLatest
        ? `Latest · ${revisionDate(selected)}`
        : `${revisionDate(selected)} · ${shortVersion}`;
      igSetNextItemWidth(versionWidth);
      const versionsOpen = igBeginCombo("##version", preview, 0);
      if (!versionsOpen && igIsItemHovered(0))
        tooltip(`${revisionDate(selected, true)}\n${selected.version}`);
      if (versionsOpen) {
        if (
          latest &&
          igSelectable_Bool("Follow latest", followLatest, 0, { x: 0, y: 0 })
        )
          select(latest, true);
        for (const entry of entries) {
          if (
            entry.project !== selected.project ||
            entry.artifact !== selected.artifact
          )
            continue;
          if (
            igSelectable_Bool(
              `${revisionDate(entry, true)} · ${entry.version.slice(-8)}##${entry.version}`,
              !followLatest && entry.directory === selected.directory,
              0,
              { x: 0, y: 0 },
            )
          )
            select(entry, false);
        }
        igEndCombo();
      }
      if (toolbarButton("Context")) showContext = !showContext;
      if (toolbarButton("Copy PNG path"))
        igSetClipboardText(join(selected.directory, "snapshot.png"));
      if (igIsItemHovered(0)) tooltip("Copy this revision's saved PNG path.");
      if (toolbarButton("Saved PDF"))
        pv_open_url(
          pathToFileURL(join(selected.directory, "snapshot.pdf")).href,
        );
      if (renderer) {
        if (toolbarButton("Copy view"))
          igSetClipboardText(
            JSON.stringify(
              {
                store: resolve(root),
                project: selected.project,
                artifact: selected.artifact,
                version: selected.version,
                theme: currentTheme(),
                params: Object.fromEntries(renderer.state.parameters),
              },
              null,
              2,
            ),
          );
        if (igIsItemHovered(0))
          tooltip(
            "Copy this revision, theme and linked controls for an agent.",
          );
        if (renderer.hasControls()) {
          if (toolbarButton("Reset controls")) renderer.resetControls();
        }
        const space = igGetContentRegionAvail();
        const sideContext = showContext && space.x >= 760;
        const contextHeight =
          showContext && !sideContext ? Math.min(220, space.y * 0.35) : 0;
        const width = Math.max(
          1,
          space.x - (sideContext ? 312 + itemSpacing.x : 0),
        );
        const height = contextHeight
          ? Math.max(1, space.y - contextHeight - itemSpacing.y)
          : 0;
        igPushID_Str(selected.directory);
        igBeginChild_Str(
          "canvas",
          { x: width, y: height },
          ImGuiChildFlags_Borders,
          0,
        );
        renderer.body(false);
        igEndChild();
        igPopID();
        if (showContext) {
          if (sideContext) igSameLine(0, -1);
          igBeginChild_Str(
            "context",
            { x: sideContext ? 312 : 0, y: 0 },
            ImGuiChildFlags_Borders,
            0,
          );
          text("Artifact context", 23, "bold");
          text(
            `${selected.project} / ${selected.artifact}`,
            15,
            "regular",
            palette.muted,
          );
          text(revisionDate(selected, true), 14, "regular", palette.muted);
          text(
            `Revision ${selected.version.slice(-8)}`,
            13,
            "mono",
            palette.muted,
          );
          const definitions = controls(renderer.document);
          if (definitions.length) {
            text("Linked controls", 18, "bold");
            for (const control of definitions) {
              text(control.label, 14, "bold", palette.muted);
              const value = parameterValue(
                renderer.state.parameters,
                control.id,
              );
              text(
                isAll(value) ? "All values" : JSON.stringify(value),
                15,
                "mono",
              );
            }
            igSpacing();
          }
          const context = renderer.document.context;
          if (context)
            for (const [key, value] of Object.entries(context)) {
              text(key, 15, "bold");
              text(
                typeof value === "string"
                  ? value
                  : JSON.stringify(value, null, 2),
                15,
              );
            }
          else
            text(
              "No additional context supplied.",
              15,
              "regular",
              palette.muted,
            );
          igEndChild();
        }
      }
    } else {
      text("A place for your ideas", 38, "bold");
      text(
        "Saved dashboards, documents and diagrams appear here.",
        20,
        "regular",
        palette.muted,
      );
    }
    if (error) text(error, 16, "regular", palette.negative);
    igEndGroup();
    igEnd();
  }
  checked(pv_surface_open(1));
  try {
    initializeTheme(options.theme ?? "light");
    select(selected, followLatest);
    while (true) {
      const inputState = pv_surface_input();
      const animating = Date.now() < animateUntil || (inputState & 1) !== 0;
      const editing = (inputState & 2) !== 0;
      const status = checked(
        pv_surface_wait(
          pending > 0 ? 0 : animating ? 16 : editing ? 250 : 1000,
        ),
      );
      if (status === 0) break;
      if (status === 2) {
        pending = 2;
        animateUntil = Date.now() + 500;
      }
      refresh();
      if (requestedTheme !== undefined) {
        setTheme(requestedTheme);
        requestedTheme = undefined;
        pending = 2;
      }
      if (pending === 0 && !animating && !editing) {
        if (unpresented) unpresented = checked(pv_surface_present()) === 1;
        continue;
      }
      if (pending > 0) pending--;
      checked(pv_surface_begin(0, 0, 1));
      pushTheme();
      draw();
      popTheme();
      igRender();
      unpresented = checked(pv_surface_present()) === 1;
    }
  } finally {
    renderer?.dispose();
    releasePanels();
    for (const key of Object.keys(fonts))
      delete fonts[key as keyof typeof fonts];
    pv_surface_close();
  }
}
