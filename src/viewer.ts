import {
  ImGuiChildFlags_Borders,
  ImGuiTreeNodeFlags_DefaultOpen,
  ImGuiWindowFlags_NoDecoration,
  ImGuiWindowFlags_NoSavedSettings,
  igBegin,
  igBeginChild_Str,
  igBeginCombo,
  igBeginGroup,
  igButton,
  igCollapsingHeader_TreeNodeFlags,
  igEnd,
  igEndChild,
  igEndCombo,
  igEndGroup,
  igPopID,
  igPushID_Str,
  igRender,
  igSameLine,
  igSelectable_Bool,
  igSetClipboardText,
  igSetNextItemWidth,
  igSetNextWindowPos,
  igSetNextWindowSize,
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
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
  text,
} from "./ui/primitives.ts";
import {
  fonts,
  initializeTheme,
  palette,
  popTheme,
  pushTheme,
} from "./ui/theme.ts";

interface Options {
  project?: string;
  artifact?: string;
  version?: string;
  parameters?: unknown;
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
    igBeginChild_Str("library", { x: 244, y: 0 }, ImGuiChildFlags_Borders, 0);
    text("PROJECT", 11, "bold", palette.accent);
    text("Visualize", 32, "bold");
    text("Your artifact library", 14, "regular", palette.muted);
    igSpacing();
    igSetNextItemWidth(-1);
    input("##find", "Find an artifact…", search);
    igSpacing();
    const query = inputValue(search).toLowerCase();
    const groups = new Map<string, Map<string, Entry>>();
    for (const entry of entries) {
      let group = groups.get(entry.project);
      if (!group) {
        group = new Map();
        groups.set(entry.project, group);
      }
      if (!group.has(entry.artifact)) group.set(entry.artifact, entry);
    }
    for (const project of [...groups.keys()].sort()) {
      if (
        !igCollapsingHeader_TreeNodeFlags(
          project,
          ImGuiTreeNodeFlags_DefaultOpen,
        )
      )
        continue;
      const artifacts = groups.get(project);
      if (!artifacts) continue;
      for (const artifact of [...artifacts.keys()].sort()) {
        const entry = artifacts.get(artifact);
        if (
          !entry ||
          (query &&
            !`${project} ${artifact} ${entry.title}`
              .toLowerCase()
              .includes(query))
        )
          continue;
        const active =
          selected?.project === project && selected?.artifact === artifact;
        if (
          igSelectable_Bool(
            `${entry.title}##${project}/${artifact}`,
            active,
            0,
            { x: 0, y: 0 },
          )
        )
          select(entry, true);
      }
    }
    if (!entries.length)
      text(
        "Render an artifact with the CLI to start your library.",
        16,
        "regular",
        palette.muted,
      );
    igEndChild();
    igSameLine(0, -1);
    igBeginGroup();
    if (selected) {
      igSetNextItemWidth(235);
      if (igBeginCombo("##version", selected.createdAt, 0)) {
        for (const entry of entries) {
          if (
            entry.project !== selected.project ||
            entry.artifact !== selected.artifact
          )
            continue;
          if (
            igSelectable_Bool(
              `${entry.createdAt}##${entry.version}`,
              entry.directory === selected.directory,
              0,
              { x: 0, y: 0 },
            )
          )
            select(entry, false);
        }
        igEndCombo();
      }
      igSameLine(0, -1);
      if (igButton("Context", { x: 0, y: 0 })) showContext = !showContext;
      igSameLine(0, -1);
      if (igButton("Copy PNG path", { x: 0, y: 0 }))
        igSetClipboardText(join(selected.directory, "snapshot.png"));
      igSameLine(0, -1);
      if (igButton("PDF", { x: 0, y: 0 }))
        pv_open_url(
          pathToFileURL(join(selected.directory, "snapshot.pdf")).href,
        );
      if (renderer) {
        if (renderer.hasControls()) {
          igSameLine(0, -1);
          if (igButton("Reset controls", { x: 0, y: 0 }))
            renderer.resetControls();
        }
        const width = Math.max(320, available() - (showContext ? 324 : 0));
        igPushID_Str(selected.directory);
        igBeginChild_Str(
          "canvas",
          { x: width, y: 0 },
          ImGuiChildFlags_Borders,
          0,
        );
        renderer.body(false);
        igEndChild();
        igPopID();
        if (showContext) {
          igSameLine(0, -1);
          igBeginChild_Str(
            "context",
            { x: 312, y: 0 },
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
          text(selected.createdAt, 14, "regular", palette.muted);
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
    initializeTheme();
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
      if (pending === 0 && !animating && !editing) continue;
      if (pending > 0) pending--;
      checked(pv_surface_begin(0, 0, 1));
      pushTheme();
      draw();
      popTheme();
      igRender();
      checked(pv_surface_present());
    }
  } finally {
    renderer?.dispose();
    for (const key of Object.keys(fonts))
      delete fonts[key as keyof typeof fonts];
    pv_surface_close();
  }
}
