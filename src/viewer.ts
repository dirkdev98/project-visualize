import {
  pv_error,
  pv_viewer_close,
  pv_viewer_event,
  pv_viewer_frame,
  pv_viewer_start,
  pv_viewer_update,
} from "maligator:ffi/visualize";
import type { Artifact } from "./model.ts";
import { list, load } from "./store.ts";

interface Options {
  project?: string;
  artifact?: string;
  version?: string;
}

export function openViewer(root: string, options: Options) {
  let entries = list(root);
  let selected = entries.find(
    (entry) =>
      (!options.project || options.project === entry.project) &&
      (!options.artifact || options.artifact === entry.artifact) &&
      (!options.version || options.version === entry.version),
  );
  let followLatest = options.version === undefined;
  let loaded = "";
  let document: Artifact | undefined;
  let error = "";
  const signature = () => entries.map((entry) => entry.directory).join("\n");
  let previous = signature();

  function publish() {
    if (selected && selected.directory !== loaded) {
      document = undefined;
      try {
        document = load(selected);
        loaded = selected.directory;
        error = "";
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }
    }
    if (
      pv_viewer_update(
        JSON.stringify({
          entries,
          selected: selected?.directory ?? "",
          document,
          error,
        }),
      ) < 0
    )
      throw new Error(pv_error() ?? "Cannot update the desktop viewer");
  }

  if (pv_viewer_start() < 0)
    throw new Error(pv_error() ?? "Cannot open the desktop viewer");
  try {
    publish();
    let refreshed = Date.now();
    while (true) {
      const status = pv_viewer_frame();
      if (status < 0) throw new Error(pv_error() ?? "Desktop rendering failed");
      if (status === 0) break;
      const message = pv_viewer_event();
      if (message) {
        const event: { selected: string; followLatest: boolean } =
          JSON.parse(message);
        selected = entries.find((entry) => entry.directory === event.selected);
        followLatest = event.followLatest;
        publish();
      }
      if (Date.now() - refreshed >= 2000) {
        try {
          const current = selected;
          entries = list(root);
          const next = signature();
          if (next !== previous) {
            selected = followLatest
              ? entries.find((entry) =>
                  current
                    ? entry.project === current.project &&
                      entry.artifact === current.artifact
                    : (!options.project || options.project === entry.project) &&
                      (!options.artifact ||
                        options.artifact === entry.artifact),
                )
              : entries.find((entry) => entry.directory === current?.directory);
            previous = next;
            error = "";
            publish();
          }
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
          publish();
        }
        refreshed = Date.now();
      }
    }
  } finally {
    pv_viewer_close();
  }
}
