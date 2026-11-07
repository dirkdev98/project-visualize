import {
  ImDrawList_AddCircleFilled,
  ImDrawList_AddRectFilled,
  ImDrawList_AddText_FontPtr,
  ImGuiChildFlags_Borders,
  ImGuiChildFlags_ResizeX,
  ImGuiCol_Button,
  ImGuiCol_ButtonActive,
  ImGuiCol_ButtonHovered,
  ImGuiCol_FrameBg,
  ImGuiCol_FrameBgActive,
  ImGuiCol_FrameBgHovered,
  ImGuiComboFlags_HeightLarge,
  ImGuiComboFlags_NoArrowButton,
  ImGuiInputFlags_RouteGlobal,
  ImGuiKey_Comma,
  ImGuiKey_Escape,
  ImGuiKey_K,
  ImGuiKey_L,
  ImGuiMod_Ctrl,
  ImGuiMod_Shift,
  ImGuiStyleVar_CellPadding,
  ImGuiStyleVar_FramePadding,
  ImGuiStyleVar_WindowPadding,
  ImGuiTableFlags_SizingStretchSame,
  ImGuiWindowFlags_NoDecoration,
  ImGuiWindowFlags_NoMove,
  ImGuiWindowFlags_NoSavedSettings,
  igBegin,
  igBeginChild_Str,
  igBeginCombo,
  igBeginGroup,
  igBeginTable,
  igButton,
  igCalcTextSize,
  igDummy,
  igEnd,
  igEndChild,
  igEndCombo,
  igEndGroup,
  igEndTable,
  igGetContentRegionAvail,
  igGetCursorScreenPos,
  igGetWindowDrawList,
  igGetWindowWidth,
  igInvisibleButton,
  igIsItemHovered,
  igIsMouseDown_Nil,
  igIsMouseHoveringRect,
  igIsWindowHovered,
  igPopFont,
  igPopID,
  igPopStyleColor,
  igPopStyleVar,
  igPushFont,
  igPushID_Str,
  igPushStyleColor_Vec4,
  igPushStyleVar_Vec2,
  igRender,
  igSameLine,
  igSelectable_Bool,
  igSetClipboardText,
  igSetCursorScreenPos,
  igSetKeyboardFocusHere,
  igSetNextItemWidth,
  igSetNextWindowPos,
  igSetNextWindowSize,
  igSetNextWindowSizeConstraints,
  igShortcut_Nil,
  igSpacing,
  igTableNextColumn,
  igTableNextRow,
  pv_surface_begin,
  pv_surface_close,
  pv_surface_command,
  pv_surface_input,
  pv_surface_input_policy,
  pv_surface_open,
  pv_surface_pinch,
  pv_surface_present,
  pv_surface_size,
  pv_surface_wait,
  SDL_GetSystemTheme,
  SDL_OpenURL,
  SDL_SYSTEM_THEME_DARK,
} from "maligator:ffi/visualize";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { controls, isAll, parameterValue } from "./data.ts";
import { libraryGroups } from "./library.ts";
import type { Theme } from "./model.ts";
import { readSettings, type Settings, saveSettings } from "./settings.ts";
import { type Entry, list, load } from "./store.ts";
import {
  DocumentRenderer,
  type DocumentState,
  documentState,
} from "./ui/content.ts";
import { artifactIcon, drawIcon, type Icon, iconButton } from "./ui/icons.ts";
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
import { SettingsPanel } from "./ui/settings.ts";
import {
  currentTheme,
  type Font,
  fonts,
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
function textWidth(value: string, size: number, font: Font): number {
  const face = fonts[font];
  if (!face) throw new Error("Fonts are not initialized");
  igPushFont(face, size);
  const width = igCalcTextSize(value, false, -1).x;
  igPopFont();
  return width;
}
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
function dateLabel(date: Date, full = false): string {
  const time = [date.getHours(), date.getMinutes()];
  if (full) time.push(date.getSeconds());
  return `${date.getDate()} ${months[date.getMonth()]}${full ? ` ${date.getFullYear()}` : ""} · ${time.map((part) => String(part).padStart(2, "0")).join(":")}`;
}
function revisionDate(entry: Entry, full = false): string {
  return dateLabel(new Date(entry.createdAt), full);
}
function relativeTime(time: number, now: number): string {
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  const date = new Date(time);
  return `${date.getDate()} ${months[date.getMonth()]}`;
}
const projectPreview = 5;
function projectHeader(project: string, collapsed: boolean): boolean {
  const start = igGetCursorScreenPos(),
    width = available(),
    height = 26;
  const clicked = igInvisibleButton("##project", { x: width, y: height }, 0);
  const hovered = igIsItemHovered(0),
    draw = igGetWindowDrawList();
  if (!draw || !fonts.bold) throw new Error("Cannot access the library canvas");
  if (hovered)
    ImDrawList_AddRectFilled(
      draw,
      start,
      { x: start.x + width, y: start.y + height },
      packed({ ...palette.ink, w: 0.05 }),
      7,
      0,
    );
  drawIcon(
    draw,
    collapsed ? "chevronRight" : "chevronDown",
    { x: start.x + 18, y: start.y + height / 2 },
    14,
    palette.muted,
  );
  ImDrawList_AddText_FontPtr(
    draw,
    fonts.bold,
    13,
    { x: start.x + 34, y: start.y + height / 2 - 7 },
    packed(hovered ? palette.ink : palette.muted),
    compactLabel(project, width - 44, 13, "bold"),
    0,
  );
  return clicked;
}
function artifactRow(entry: Entry, updated: number, active: boolean): boolean {
  const start = igGetCursorScreenPos(),
    width = available(),
    height = 32;
  igPushStyleColor_Vec4(ImGuiCol_Button, {
    ...palette.accent,
    w: active ? 0.14 : 0,
  });
  igPushStyleColor_Vec4(ImGuiCol_ButtonHovered, {
    ...palette.accent,
    w: active ? 0.2 : 0.08,
  });
  igPushStyleColor_Vec4(ImGuiCol_ButtonActive, { ...palette.accent, w: 0.24 });
  const clicked = igButton(`##${entry.artifact}`, { x: width, y: height });
  igPopStyleColor(3);
  const hovered = igIsItemHovered(0),
    draw = igGetWindowDrawList();
  if (!draw || !fonts.regular)
    throw new Error("Cannot access the library canvas");
  const middle = start.y + height / 2;
  drawIcon(
    draw,
    artifactIcon(entry.type),
    { x: start.x + 18, y: middle },
    16,
    active ? palette.accent : palette.muted,
  );
  const age = relativeTime(updated, Date.now());
  const ageWidth = textWidth(age, 12, "regular");
  let right = start.x + width - 10 - ageWidth;
  ImDrawList_AddText_FontPtr(
    draw,
    fonts.regular,
    12,
    { x: right, y: middle - 6 },
    packed(palette.muted),
    age,
    0,
  );
  if (entry.currentPresentation) {
    right -= 10;
    ImDrawList_AddCircleFilled(
      draw,
      { x: right, y: middle },
      3,
      packed(palette.accent),
      0,
    );
    right -= 4;
  }
  ImDrawList_AddText_FontPtr(
    draw,
    fonts.regular,
    14,
    { x: start.x + 34, y: middle - 7 },
    packed(palette.ink),
    compactLabel(entry.title, right - start.x - 44, 14, "regular"),
    0,
  );
  if (hovered)
    tooltip(
      `${entry.title}\n${entry.project} / ${entry.artifact}\nUpdated ${dateLabel(new Date(updated))}${entry.currentPresentation ? "\nShowing the presented revision" : ""}`,
    );
  return clicked;
}
function moreRow(label: string): boolean {
  const start = igGetCursorScreenPos(),
    width = available(),
    height = 26;
  const clicked = igInvisibleButton("##more", { x: width, y: height }, 0);
  const hovered = igIsItemHovered(0),
    draw = igGetWindowDrawList();
  if (!draw || !fonts.regular)
    throw new Error("Cannot access the library canvas");
  ImDrawList_AddText_FontPtr(
    draw,
    fonts.regular,
    13,
    { x: start.x + 34, y: start.y + height / 2 - 7 },
    packed(hovered ? palette.ink : palette.muted),
    label,
    0,
  );
  return clicked;
}

interface Options {
  project?: string;
  artifact?: string;
  version?: string;
  parameters?: unknown;
  theme?: Theme;
}
export function openViewer(root: string, options: Options) {
  let preferences = readSettings(root);
  let diskPreferences = JSON.stringify(preferences);
  let entries = list(root);
  let selected = entries.find(
    (entry) =>
      (!options.project || entry.project === options.project) &&
      (!options.artifact || entry.artifact === options.artifact) &&
      (!options.version || entry.version === options.version),
  );
  if (!options.version)
    selected =
      entries.find(
        (entry) =>
          entry.currentPresentation &&
          (!options.project || entry.project === options.project) &&
          (!options.artifact || entry.artifact === options.artifact),
      ) ?? selected;
  const initialDirectory = selected?.directory;
  let followLatest = options.version === undefined;
  let followPresented = options.version === undefined;
  let loaded = "",
    error = "";
  let renderer: DocumentRenderer | undefined;
  const signatureOf = (values: Entry[]) =>
    values
      .map(
        (entry) =>
          `${entry.directory}:${entry.presentedAt ?? ""}:${entry.currentPresentation ?? false}`,
      )
      .join("\n");
  let previous = signatureOf(entries);
  let refreshed = Date.now();
  let pending = 2,
    animateUntil = 0,
    showContext = false,
    showSettings = false;
  let unpresented = false;
  let copied: { what: string; until: number } | undefined;
  const collapsedProjects = new Set<string>(),
    expandedProjects = new Set<string>();
  let themeOverride = options.theme;
  let requestedTheme: Theme | undefined;
  const search = inputBuffer();
  const states = new Map<string, DocumentState>();
  function preferredTheme(): Theme {
    return preferences.appearance === "system"
      ? SDL_GetSystemTheme() === SDL_SYSTEM_THEME_DARK
        ? "dark"
        : "light"
      : preferences.appearance;
  }
  function applyPreferences(patch: Partial<Settings>, persist = true) {
    const next = { ...preferences, ...patch };
    preferences = persist ? saveSettings(root, next) : next;
    if (persist) diskPreferences = JSON.stringify(preferences);
    if (patch.appearance !== undefined) {
      themeOverride = undefined;
      requestedTheme = preferredTheme();
    }
    checked(pv_surface_input_policy(preferences.wheelScale, ImGuiMod_Ctrl));
    pending = 2;
  }
  function closeSettings() {
    showSettings = false;
    pending = 2;
  }
  const settingsPanel = new SettingsPanel(
    root,
    preferences,
    applyPreferences,
    closeSettings,
  );
  function select(
    entry: Entry | undefined,
    follow: boolean,
    presented = false,
  ) {
    selected = entry;
    followLatest = follow;
    followPresented = presented;
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
        requestedTheme = themeOverride ?? preferredTheme();
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
      const latestSettings = readSettings(root);
      if (JSON.stringify(latestSettings) !== diskPreferences) {
        preferences = latestSettings;
        diskPreferences = JSON.stringify(preferences);
        checked(pv_surface_input_policy(preferences.wheelScale, ImGuiMod_Ctrl));
        requestedTheme = themeOverride ?? preferredTheme();
        pending = 2;
      }
      const current = selected;
      entries = list(root);
      const signature = signatureOf(entries);
      if (signature !== previous) {
        const matching = entries.filter((entry) =>
          current
            ? entry.project === current.project &&
              entry.artifact === current.artifact
            : (!options.project || entry.project === options.project) &&
              (!options.artifact || entry.artifact === options.artifact),
        );
        const entry = followPresented
          ? (matching.find((entry) => entry.currentPresentation) ?? matching[0])
          : followLatest
            ? matching[0]
            : entries.find((entry) => entry.directory === current?.directory);
        previous = signature;
        select(entry, followLatest, followPresented);
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      pending = 2;
    }
    refreshed = Date.now();
  }
  function draw() {
    const pinchScale = pv_surface_pinch();
    const size = pv_surface_size();
    igSetNextWindowPos({ x: 0, y: 0 }, 0, { x: 0, y: 0 });
    igSetNextWindowSize(size, 0);
    igPushStyleVar_Vec2(ImGuiStyleVar_WindowPadding, { x: 16, y: 16 });
    igBegin(
      "Visualize",
      ImGuiWindowFlags_NoDecoration |
        ImGuiWindowFlags_NoMove |
        ImGuiWindowFlags_NoSavedSettings,
    );
    igPopStyleVar(1);
    // ImGui maps Command to Ctrl when its macOS behavior is enabled.
    const focusSearch = igShortcut_Nil(
      ImGuiMod_Ctrl | ImGuiKey_K,
      ImGuiInputFlags_RouteGlobal,
    );
    if (
      igShortcut_Nil(
        ImGuiMod_Ctrl | ImGuiKey_Comma,
        ImGuiInputFlags_RouteGlobal,
      )
    ) {
      showSettings = true;
      pending = 2;
    }
    if (
      showSettings &&
      igShortcut_Nil(ImGuiKey_Escape, ImGuiInputFlags_RouteGlobal)
    )
      closeSettings();
    const maxSidebar = Math.min(420, Math.max(200, size.x * 0.4));
    igSetNextWindowSizeConstraints(
      { x: 200, y: 0 },
      { x: maxSidebar, y: 100000 },
    );
    igPushStyleVar_Vec2(ImGuiStyleVar_WindowPadding, { x: 16, y: 18 });
    igBeginChild_Str(
      "library",
      { x: Math.min(preferences.sidebarWidth, maxSidebar), y: 0 },
      ImGuiChildFlags_ResizeX,
      0,
    );
    igPopStyleVar(1);
    const sidebarWidth = Math.round(igGetWindowWidth());
    if (sidebarWidth !== preferences.sidebarWidth && !igIsMouseDown_Nil(0))
      applyPreferences({ sidebarWidth });
    text("Visualize", 22, "bold");
    if (
      igShortcut_Nil(
        ImGuiMod_Ctrl | ImGuiMod_Shift | ImGuiKey_L,
        ImGuiInputFlags_RouteGlobal,
      )
    ) {
      applyPreferences({
        appearance: currentTheme() === "light" ? "dark" : "light",
      });
    }
    igSpacing();
    igSetNextItemWidth(-1);
    if (focusSearch) igSetKeyboardFocusHere(0);
    input("##find", "Search artifacts", search);
    if (igIsItemHovered(0))
      tooltip(
        process.platform === "darwin" ? "Search · Cmd+K" : "Search · Ctrl+K",
      );
    igSpacing();
    igBeginChild_Str(
      "library-items",
      { x: 0, y: process.platform === "darwin" ? -62 : -106 },
      0,
      0,
    );
    const query = inputValue(search).trim().toLowerCase();
    let matches = 0;
    for (const { project, artifacts } of libraryGroups(entries)) {
      const visible = artifacts.filter(
        ({ artifact, entry }) =>
          !query ||
          `${project} ${artifact} ${entry.title}`.toLowerCase().includes(query),
      );
      if (!visible.length) continue;
      matches += visible.length;
      igPushID_Str(project);
      const collapsed = !query && collapsedProjects.has(project);
      if (projectHeader(project, collapsed)) {
        if (collapsed) collapsedProjects.delete(project);
        else collapsedProjects.add(project);
        pending = 2;
      }
      if (!collapsed) {
        // Searching lists every match; otherwise the list stays short, but the
        // selected artifact remains visible below the most recent ones.
        const expanded = query !== "" || expandedProjects.has(project);
        const shown = expanded
          ? visible
          : visible.filter(
              ({ artifact }, index) =>
                index < projectPreview ||
                (selected?.project === project &&
                  selected.artifact === artifact),
            );
        for (const { artifact, entry, updated } of shown) {
          const active =
            selected?.project === project && selected?.artifact === artifact;
          if (artifactRow(entry, updated, active)) {
            showSettings = false;
            select(entry, true, true);
          }
        }
        if (!query && visible.length > projectPreview) {
          if (
            moreRow(expandedProjects.has(project) ? "Show less" : "Show more…")
          ) {
            if (expandedProjects.has(project)) expandedProjects.delete(project);
            else expandedProjects.add(project);
            pending = 2;
          }
        }
      }
      igPopID();
      igDummy({ x: 0, y: 4 });
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
    if (process.platform !== "darwin") {
      if (igButton("Settings", { x: -1, y: 0 })) {
        showSettings = true;
        pending = 2;
      }
    }
    text("LIBRARY", 10, "bold", palette.muted);
    text(
      compactLabel(root, available(), 12, "regular"),
      12,
      "regular",
      palette.muted,
    );
    if (igIsItemHovered(0)) tooltip(resolve(root));
    igEndChild();
    igSameLine(0, -1);
    igBeginGroup();
    if (showSettings) {
      igBeginChild_Str("settings", { x: 0, y: 0 }, 0, 0);
      settingsPanel.body(preferences);
      igEndChild();
    } else if (selected) {
      const current = selected;
      const latest = entries.find(
        (entry) =>
          entry.project === current.project &&
          entry.artifact === current.artifact,
      );
      const delivered = entries.find(
        (entry) =>
          entry.project === current.project &&
          entry.artifact === current.artifact &&
          entry.currentPresentation,
      );
      const preview =
        followPresented && current.currentPresentation
          ? `Presented · ${revisionDate(current)}`
          : followLatest
            ? `Latest · ${revisionDate(current)}`
            : `${revisionDate(current)} · ${current.version.slice(-8)}`;
      const rowStart = igGetCursorScreenPos(),
        rowWidth = available(),
        rowHeight = 32,
        middle = rowStart.y + rowHeight / 2,
        draw = igGetWindowDrawList();
      if (!draw || !fonts.regular || !fonts.bold)
        throw new Error("Cannot access the toolbar canvas");
      const now = Date.now();
      const copy = (what: string, value: string) => {
        igSetClipboardText(value);
        copied = { what, until: now + 1500 };
        animateUntil = Math.max(animateUntil, copied.until);
      };
      const copiedNow = (what: string) =>
        copied?.what === what && now < copied.until;
      const view = renderer;
      const actions: {
        id: string;
        icon: Icon;
        hint: string;
        active?: boolean;
        run: () => void;
      }[] = [];
      if (view?.hasControls())
        actions.push({
          id: "reset",
          icon: "reset",
          hint: "Reset controls",
          run: () => view.resetControls(),
        });
      if (view)
        actions.push({
          id: "view",
          icon: copiedNow("view") ? "check" : "copy",
          hint: copiedNow("view")
            ? "Copied"
            : "Copy view: revision, theme and linked controls for an agent",
          run: () =>
            copy(
              "view",
              JSON.stringify(
                {
                  store: resolve(root),
                  project: current.project,
                  artifact: current.artifact,
                  version: current.version,
                  theme: currentTheme(),
                  params: Object.fromEntries(view.state.parameters),
                },
                null,
                2,
              ),
            ),
        });
      actions.push(
        {
          id: "png",
          icon: copiedNow("png") ? "check" : "image",
          hint: copiedNow("png") ? "Copied" : "Copy PNG path",
          run: () => copy("png", join(current.directory, "snapshot.png")),
        },
        {
          id: "pdf",
          icon: "pdf",
          hint: "Open saved PDF",
          run: () =>
            SDL_OpenURL(
              pathToFileURL(join(current.directory, "snapshot.pdf")).href,
            ),
        },
      );
      if (view)
        actions.push({
          id: "context",
          icon: "context",
          hint: showContext ? "Hide context" : "Show context",
          active: showContext,
          run: () => {
            showContext = !showContext;
          },
        });
      const button = 28,
        gap = 4,
        actionsWidth = actions.length * (button + gap) - gap;
      for (const [index, action] of actions.entries()) {
        igSetCursorScreenPos({
          x: rowStart.x + rowWidth - actionsWidth + index * (button + gap),
          y: middle - button / 2,
        });
        if (
          iconButton(`##${action.id}`, action.icon, action.hint, {
            active: action.active,
            size: button,
          })
        )
          action.run();
      }
      const pillWidth = Math.max(
        1,
        Math.min(
          rowWidth - actionsWidth - 16,
          textWidth(preview, 14, "regular") + 40,
        ),
      );
      const crumbWidth = rowWidth - actionsWidth - pillWidth - 28;
      let x = rowStart.x;
      const projectWidth = textWidth(current.project, 14, "regular");
      if (crumbWidth >= 72) {
        const withProject =
          projectWidth +
            20 +
            24 +
            Math.min(120, textWidth(current.title, 14, "bold")) <=
          crumbWidth;
        if (withProject) {
          ImDrawList_AddText_FontPtr(
            draw,
            fonts.regular,
            14,
            { x, y: middle - 7 },
            packed(palette.muted),
            current.project,
            0,
          );
          x += projectWidth + 4;
          drawIcon(
            draw,
            "chevronRight",
            { x: x + 8, y: middle },
            14,
            palette.muted,
          );
          x += 20;
        }
        drawIcon(
          draw,
          artifactIcon(current.type),
          { x: x + 8, y: middle },
          16,
          palette.ink,
        );
        x += 24;
        const title = compactLabel(
          current.title,
          rowStart.x + crumbWidth - x,
          14,
          "bold",
        );
        ImDrawList_AddText_FontPtr(
          draw,
          fonts.bold,
          14,
          { x, y: middle - 7 },
          packed(palette.ink),
          title,
          0,
        );
        if (
          igIsWindowHovered(0) &&
          igIsMouseHoveringRect(
            { x: rowStart.x, y: rowStart.y },
            { x: x + textWidth(title, 14, "bold"), y: rowStart.y + rowHeight },
            true,
          )
        )
          tooltip(`${current.title}\n${current.project} / ${current.artifact}`);
        x += textWidth(title, 14, "bold") + 12;
      }
      igSetCursorScreenPos({ x, y: middle - 14 });
      igSetNextItemWidth(pillWidth);
      igPushStyleColor_Vec4(ImGuiCol_FrameBg, { ...palette.ink, w: 0 });
      igPushStyleColor_Vec4(ImGuiCol_FrameBgHovered, {
        ...palette.ink,
        w: 0.06,
      });
      igPushStyleColor_Vec4(ImGuiCol_FrameBgActive, {
        ...palette.ink,
        w: 0.1,
      });
      igPushStyleVar_Vec2(ImGuiStyleVar_FramePadding, { x: 10, y: 7 });
      igPushFont(fonts.regular, 14);
      const versionsOpen = igBeginCombo(
        "##version",
        preview,
        ImGuiComboFlags_NoArrowButton | ImGuiComboFlags_HeightLarge,
      );
      igPopFont();
      igPopStyleVar(1);
      igPopStyleColor(3);
      if (!versionsOpen && igIsItemHovered(0))
        tooltip(`${revisionDate(current, true)}\n${current.version}`);
      if (versionsOpen) {
        if (
          delivered &&
          igSelectable_Bool("Follow presented", followPresented, 0, {
            x: 0,
            y: 0,
          })
        )
          select(delivered, true, true);
        if (
          latest &&
          igSelectable_Bool(
            "Follow latest",
            followLatest && (!followPresented || !delivered),
            0,
            { x: 0, y: 0 },
          )
        )
          select(latest, true);
        for (const entry of entries) {
          if (
            entry.project !== current.project ||
            entry.artifact !== current.artifact
          )
            continue;
          if (
            igSelectable_Bool(
              `${entry.presentedAt ? "Presented · " : ""}${revisionDate(entry, true)} · ${entry.version.slice(-8)}##${entry.version}`,
              !followLatest && entry.directory === current.directory,
              0,
              { x: 0, y: 0 },
            )
          )
            select(entry, false);
        }
        igEndCombo();
      }
      drawIcon(
        draw,
        "chevronDown",
        { x: x + pillWidth - 15, y: middle },
        14,
        palette.muted,
      );
      igSetCursorScreenPos(rowStart);
      igDummy({ x: rowWidth, y: rowHeight });
      if (renderer && selected) {
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
        renderer.body(false, pinchScale);
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
          const definitions = controls(renderer.document);
          text(
            definitions.length ? "Linked controls" : "Artifact context",
            18,
            "bold",
          );
          text(
            `Revision ${selected.version.slice(-8)}`,
            13,
            "mono",
            palette.muted,
          );
          if (igIsItemHovered(0))
            tooltip(
              `${selected.project} / ${selected.artifact}\n${revisionDate(selected, true)}\n${selected.version}`,
            );
          if (definitions.length) {
            igPushStyleVar_Vec2(ImGuiStyleVar_CellPadding, { x: 4, y: 3 });
            if (
              igBeginTable(
                "parameters",
                2,
                ImGuiTableFlags_SizingStretchSame,
                { x: 0, y: 0 },
                0,
              )
            ) {
              for (const control of definitions) {
                igTableNextRow(0, 0);
                igTableNextColumn();
                text(control.label, 14, "bold", palette.muted);
                igTableNextColumn();
                const value = parameterValue(
                  renderer.state.parameters,
                  control.id,
                );
                let display: string;
                if (isAll(value)) display = "All values";
                else if (value !== null && typeof value === "object")
                  display =
                    value.min === undefined
                      ? `Up to ${value.max}`
                      : value.max === undefined
                        ? `From ${value.min}`
                        : `${value.min} to ${value.max}`;
                else display = JSON.stringify(value);
                text(display, 14, "mono");
              }
              igEndTable();
            }
            igPopStyleVar(1);
            igSpacing();
            text("Artifact context", 18, "bold");
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
    initializeTheme(themeOverride ?? preferredTheme());
    checked(pv_surface_input_policy(preferences.wheelScale, ImGuiMod_Ctrl));
    select(selected, followLatest, followPresented);
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
      if (pv_surface_command() === 1) {
        showSettings = true;
        pending = 2;
      }
      if (status === 2) {
        pending = 2;
        animateUntil = Date.now() + 500;
      }
      refresh();
      if (
        preferences.appearance === "system" &&
        themeOverride === undefined &&
        preferredTheme() !== currentTheme()
      )
        requestedTheme = preferredTheme();
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
