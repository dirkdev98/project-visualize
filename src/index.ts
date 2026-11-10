import { SDL_setenv_unsafe } from "maligator:ffi/visualize";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createParameters, resolveView } from "./data.ts";
import { blockEntries, exportView } from "./export-view.ts";
import { exportHtml } from "./html/export.ts";
import { slug, validate } from "./model.ts";
import {
  type Appearance,
  creationTheme,
  readSettings,
  saveSettings,
  systemTheme,
} from "./settings.ts";
import {
  archive,
  find,
  list,
  load,
  present,
  save,
  storeRoot,
} from "./store.ts";
import { renderArtifact as render } from "./ui/export.ts";
import { openViewer } from "./viewer.ts";
import {
  claimViewer,
  requestViewer,
  type ViewerOptions,
  viewerRunning,
} from "./viewer-control.ts";
import {
  executablePath,
  linkInstallation,
  skillResources,
} from "./workflow.ts";

const help = `Project Visualize

visualize render --project ID --artifact ID --file document.json
visualize list [--project ID] [--artifact ID] [--search QUERY] [--status active|archived|all]
visualize archive --project ID --artifact ID
visualize restore --project ID --artifact ID
visualize inspect --project ID --artifact ID [--version ID]
visualize export --project ID --artifact ID --format png|pdf|html [--out FILE]
visualize open [--project ID] [--artifact ID] [--version ID]
visualize viewer --action status|capture|outline|navigate|close [--heading ID] [--out screenshot.png]
visualize validate --file document.json
visualize present --project ID --artifact ID --version ID
visualize skill [--out DIRECTORY]
visualize install --cli PATH | --skill PATH
visualize settings [--appearance system|light|dark] [--scroll-speed 5..100]

Use --file - to read JSON from stdin. Every command accepts --store DIRECTORY.
render and export accept --width 320..2560. PNG/PDF captures accept --scale 1|2, defaulting to 2x.
render accepts --mobile-width 320..600 to save a second responsive PNG.
render, export and open accept --theme light|dark.
render always saves a new immutable version with PNG and PDF snapshots.
Commands return JSON. open (the default) navigates the viewer, starting it if needed.
inspect, export and open accept --params JSON to override declared controls.
export accepts --block PATH to export one whole widget or card; inspect lists paths.
HTML exports accept --html-mode standalone|inline|fragment (default standalone).
Without --out, exports are organized under the library's exports directory.
open accepts --search QUERY and --focus true|false.
viewer capture accepts --content-width 280..2560, --height 320..2000, --scroll PIXELS|all and --scale 1|2.
`;

let runtimeDirectory: string | undefined;
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || args[0] === "help") {
    process.stdout.write(help);
    return;
  }
  if (args.length === 1 && args[0] === "--version") {
    process.stdout.write(
      `${readFileSync(mal.assets.materialize("version"), "utf8")}\n`,
    );
    return;
  }
  const command =
    args.length && !args[0].startsWith("--") ? args.shift() : "open";
  const permitted: Record<string, string[]> = {
    render: [
      "project",
      "artifact",
      "file",
      "width",
      "scale",
      "store",
      "theme",
      "mobile-width",
    ],
    list: ["project", "artifact", "store", "search", "status"],
    archive: ["project", "artifact", "store"],
    restore: ["project", "artifact", "store"],
    inspect: ["project", "artifact", "version", "store", "params"],
    export: [
      "project",
      "artifact",
      "version",
      "format",
      "out",
      "width",
      "scale",
      "store",
      "params",
      "theme",
      "block",
      "html-mode",
    ],
    open: [
      "project",
      "artifact",
      "version",
      "store",
      "params",
      "theme",
      "search",
      "focus",
      "contents",
    ],
    viewer: [
      "action",
      "project",
      "artifact",
      "version",
      "store",
      "params",
      "theme",
      "search",
      "focus",
      "out",
      "content-width",
      "height",
      "scroll",
      "scale",
      "heading",
      "contents",
    ],
    "viewer-host": ["store"],
    validate: ["file", "store"],
    present: ["project", "artifact", "version", "store"],
    skill: ["out", "store"],
    install: ["cli", "skill", "store"],
    settings: ["appearance", "scroll-speed", "store"],
  };
  if (!command || !Object.hasOwn(permitted, command))
    throw new Error(`Unknown command ${command}; use --help`);
  const options: Record<string, string> = {};
  while (args.length) {
    const option = args.shift() as string;
    const key = option.slice(2);
    if (!option.startsWith("--") || !permitted[command].includes(key))
      throw new Error(`Unknown option ${option}`);
    const value = args.shift();
    if (!value || value.startsWith("--"))
      throw new Error(`${option} requires a value`);
    if (options[key] !== undefined)
      throw new Error(`Duplicate option ${option}`);
    options[key] = value;
  }
  const required = (key: string) => {
    const value = options[key];
    if (!value) throw new Error(`--${key} is required`);
    return value;
  };
  const dimension = (
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const value = options[key] === undefined ? fallback : Number(options[key]);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`--${key} must be an integer from ${min} to ${max}`);
    return value;
  };
  const root = storeRoot(options.store);
  if (
    process.platform === "linux" &&
    !process.env.XDG_RUNTIME_DIR &&
    ["render", "export", "viewer-host"].includes(command)
  ) {
    runtimeDirectory = mkdtempSync(join(tmpdir(), "visualize-runtime-"));
    // Set this before native graphics workers start reading the process environment.
    if (SDL_setenv_unsafe("XDG_RUNTIME_DIR", runtimeDirectory, 1) !== 0)
      throw new Error("Cannot prepare the graphics runtime directory");
    process.env.XDG_RUNTIME_DIR = runtimeDirectory;
  }
  const parameters =
    options.params === undefined ? undefined : JSON.parse(options.params);
  const theme = options.theme;
  if (theme !== undefined && theme !== "light" && theme !== "dark")
    throw new Error("--theme must be light or dark");
  for (const key of ["project", "artifact"])
    if (options[key]) slug(options[key], key);
  let result: unknown;
  if (command === "viewer-host") {
    const controller = claimViewer(root);
    if (!controller) return;
    try {
      await openViewer(root, {}, controller);
    } catch (error) {
      try {
        writeFileSync(
          join(controller.directory, "last-error.json"),
          `${JSON.stringify(
            {
              time: new Date().toISOString(),
              pid: process.pid,
              executable: executablePath,
              error:
                error instanceof Error
                  ? (error.stack ?? error.message)
                  : String(error),
            },
            null,
            2,
          )}\n`,
          { mode: 0o600 },
        );
      } catch {}
      throw error;
    } finally {
      controller.close();
    }
    return;
  } else if (command === "render" || command === "validate") {
    const file = required("file");
    const raw = readFileSync(file === "-" ? 0 : file, "utf8");
    if (Buffer.byteLength(raw) > 5 * 1024 * 1024)
      throw new Error("Artifact document exceeds 5 MiB");
    const document = validate(JSON.parse(raw));
    if (theme !== undefined) document.theme = theme;
    if (command === "validate") result = { valid: true, title: document.title };
    else {
      const width = dimension("width", 1280, 320, 2560),
        scale = dimension("scale", 2, 1, 2);
      const entry = await save(
        root,
        required("project"),
        required("artifact"),
        document,
        file === "-" ? process.cwd() : dirname(resolve(file)),
        width,
        scale,
        render,
        {
          mobileWidth:
            options["mobile-width"] === undefined
              ? undefined
              : dimension("mobile-width", 390, 320, 600),
          theme: document.theme ?? creationTheme(root),
        },
      );
      result = {
        ...entry,
        document: join(entry.directory, "document.json"),
        png: join(entry.directory, "snapshot.png"),
        pdf: join(entry.directory, "snapshot.pdf"),
        screenshots: {
          desktop: join(entry.directory, "snapshot.png"),
          ...(entry.mobile
            ? { mobile: join(entry.directory, "snapshot-mobile.png") }
            : {}),
        },
      };
    }
  } else if (command === "settings") {
    let settings = readSettings(root);
    if (
      options.appearance !== undefined ||
      options["scroll-speed"] !== undefined
    )
      settings = saveSettings(root, {
        ...(options.appearance === undefined
          ? {}
          : { appearance: options.appearance as Appearance }),
        ...(options["scroll-speed"] === undefined
          ? {}
          : { wheelScale: Number(options["scroll-speed"]) / 100 }),
      });
    result = {
      ...settings,
      effectiveTheme:
        settings.appearance === "system" ? systemTheme() : settings.appearance,
      file: join(root, "settings.json"),
    };
  } else if (command === "present") {
    result = present(
      root,
      required("project"),
      required("artifact"),
      required("version"),
    );
    if (viewerRunning(root))
      result = {
        ...(result as object),
        viewer: await requestViewer(root, {
          action: "open",
          options: {
            project: options.project,
            artifact: options.artifact,
            version: options.version,
          },
        }),
      };
  } else if (command === "skill") {
    result = skillResources(root, options.out);
  } else if (command === "install") {
    if (Boolean(options.cli) === Boolean(options.skill))
      throw new Error(
        "Choose exactly one installation: --cli PATH or --skill PATH",
      );
    result = linkInstallation(
      options.cli ? executablePath : skillResources(root).directory,
      options.cli ?? required("skill"),
    );
  } else if (command === "archive" || command === "restore") {
    result = archive(
      root,
      required("project"),
      required("artifact"),
      command === "archive",
    );
  } else if (command === "list") {
    const query = options.search?.trim().toLowerCase() ?? "",
      status = options.status ?? (query ? "all" : "active");
    if (!["active", "archived", "all"].includes(status))
      throw new Error("--status must be active, archived or all");
    result = {
      store: root,
      versions: list(root, options.project, options.artifact).filter(
        (entry) =>
          (status === "all" ||
            (status === "archived") === !!entry.archivedAt) &&
          (!query ||
            `${entry.project} ${entry.artifact} ${entry.title}`
              .toLowerCase()
              .includes(query)),
      ),
    };
  } else if (command === "inspect") {
    const entry = find(
      root,
      required("project"),
      required("artifact"),
      options.version,
    );
    const document = JSON.parse(
      readFileSync(join(entry.directory, "document.json"), "utf8"),
    );
    const view = resolveView(document, createParameters(document, parameters));
    result = {
      ...entry,
      document,
      view: {
        blocks: blockEntries(view.body),
        parameters: view.parameters,
        datasetRows: Object.fromEntries(
          Object.entries(view.datasets).map(([name, rows]) => [
            name,
            rows.length,
          ]),
        ),
        body: view.body,
        chartSelections: Object.fromEntries(view.chartSelections),
      },
    };
  } else if (command === "export") {
    const entry = find(
      root,
      required("project"),
      required("artifact"),
      options.version,
    );
    const format = required("format");
    if (format !== "png" && format !== "pdf" && format !== "html")
      throw new Error("--format must be png, pdf or html");
    const mode = options["html-mode"] ?? "standalone";
    if (!["standalone", "inline", "fragment"].includes(mode))
      throw new Error("--html-mode must be standalone, inline or fragment");
    if (options["html-mode"] && format !== "html")
      throw new Error("--html-mode requires --format html");
    if (format === "html" && options.scale !== undefined)
      throw new Error("--scale applies only to PNG and PDF exports");
    const selected = exportView(load(entry), parameters, options.block);
    selected.document.theme =
      theme ?? entry.theme ?? selected.document.theme ?? "light";
    const managed = options.out === undefined;
    const out = resolve(
      options.out ??
        join(
          root,
          "exports",
          entry.project,
          entry.artifact,
          entry.version,
          randomUUID(),
          `${entry.artifact}.${format}`,
        ),
    );
    if (!out.toLowerCase().endsWith(`.${format}`))
      throw new Error(`--out must end with .${format}`);
    if (out.startsWith(`${root}/projects/`))
      throw new Error(
        "Export outside the saved version store to preserve history",
      );
    mkdirSync(dirname(out), { recursive: true });
    const width = dimension("width", entry.width, 320, 2560),
      scale = dimension("scale", 2, 1, 2);
    const provenance = {
      project: entry.project,
      artifact: entry.artifact,
      version: entry.version,
      ...(options.block ? { block: options.block } : {}),
    };
    const selectedParameters = Object.fromEntries(selected.parameters);
    const temporary = `${out}.${randomUUID()}.${format}`;
    let bytes: number | undefined;
    try {
      if (format === "html")
        bytes = exportHtml(
          selected.document,
          selected.parameters,
          temporary,
          width,
          {
            partial: selected.partial,
            mode: mode as "standalone" | "inline" | "fragment",
            provenance,
            supportControls: selected.supportControls,
          },
        );
      else
        await render(
          selected.supportControls.length
            ? {
                ...selected.document,
                body: resolveView(
                  selected.document,
                  selected.parameters,
                  selected.supportControls,
                ).body,
              }
            : selected.document,
          temporary,
          width,
          scale,
          selectedParameters,
          theme,
          { header: !selected.partial },
        );
      renameSync(temporary, out);
    } finally {
      rmSync(temporary, { force: true });
    }
    const exported = {
      output: out,
      format,
      width,
      ...(format === "html" ? {} : { scale }),
      ...(theme ? { theme } : {}),
      ...provenance,
      ...(bytes === undefined ? {} : { bytes, mode }),
    };
    result = exported;
    if (managed)
      writeFileSync(
        join(dirname(out), "export.json"),
        `${JSON.stringify({ ...exported, parameters: selectedParameters, theme: selected.document.theme, createdAt: new Date().toISOString() }, null, 2)}\n`,
      );
  } else if (command === "open" || command === "viewer") {
    if (options.artifact && !options.project)
      throw new Error("--artifact requires --project");
    if (options.version && (!options.project || !options.artifact))
      throw new Error("--version requires --project and --artifact");
    if (parameters !== undefined) {
      if (!options.project || !options.artifact)
        throw new Error("--params requires --project and --artifact");
      createParameters(
        load(
          options.version
            ? find(root, options.project, options.artifact, options.version)
            : (list(root, options.project, options.artifact).find(
                (entry) => entry.currentPresentation,
              ) ?? find(root, options.project, options.artifact)),
        ),
        parameters,
      );
    }
    if (options.project && options.artifact)
      find(root, options.project, options.artifact, options.version);
    if (
      options.focus !== undefined &&
      !["true", "false"].includes(options.focus)
    )
      throw new Error("--focus must be true or false");
    if (
      options.contents !== undefined &&
      !["true", "false"].includes(options.contents)
    )
      throw new Error("--contents must be true or false");
    const viewerOptions: ViewerOptions = {
      project: options.project,
      artifact: options.artifact,
      version: options.version,
      parameters,
      theme,
      search: options.search,
      focus: options.focus !== "false",
      ...(options.contents !== undefined
        ? { contents: options.contents === "true" }
        : {}),
    };
    if (command === "open")
      result = await requestViewer(
        root,
        { action: "open", options: viewerOptions },
        true,
      );
    else {
      const action = required("action");
      if (
        !["status", "capture", "close", "outline", "navigate"].includes(action)
      )
        throw new Error(
          "--action must be status, capture, outline, navigate or close",
        );
      let capture:
        | {
            out: string;
            canvasWidth?: number;
            height?: number;
            scroll?: number | "all";
            scale: number;
          }
        | undefined;
      if (action === "capture") {
        const out = resolve(required("out"));
        if (!out.toLowerCase().endsWith(".png"))
          throw new Error("--out must end with .png");
        if (out.startsWith(`${root}/projects/`))
          throw new Error(
            "Capture outside the saved version store to preserve history",
          );
        const scroll =
          options.scroll === "all" ? "all" : Number(options.scroll ?? 0);
        if (scroll !== "all" && (!Number.isFinite(scroll) || scroll < 0))
          throw new Error("--scroll must be a nonnegative number or all");
        capture = {
          out,
          scale: dimension("scale", 1, 1, 2),
          ...(options["content-width"]
            ? { canvasWidth: dimension("content-width", 390, 280, 2560) }
            : {}),
          ...(options.height
            ? { height: dimension("height", 900, 320, 2000) }
            : {}),
          scroll,
        };
      }
      result = await requestViewer(root, {
        action: action as
          | "status"
          | "capture"
          | "close"
          | "outline"
          | "navigate",
        options: viewerOptions,
        ...(action === "navigate" ? { heading: required("heading") } : {}),
        ...(capture ? { capture } : {}),
      });
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    if (runtimeDirectory)
      rmSync(runtimeDirectory, { recursive: true, force: true });
  });
