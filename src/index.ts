import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createParameters, resolveView } from "./data.ts";
import { slug, validate } from "./model.ts";
import { find, list, load, present, save, storeRoot } from "./store.ts";
import { renderArtifact as render } from "./ui/export.ts";
import { openViewer } from "./viewer.ts";
import {
  executablePath,
  linkInstallation,
  skillResources,
} from "./workflow.ts";

const help = `Project Visualize

visualize render --project ID --artifact ID --file document.json
visualize list [--project ID] [--artifact ID]
visualize inspect --project ID --artifact ID [--version ID]
visualize export --project ID --artifact ID --format png|pdf --out FILE
visualize open [--project ID] [--artifact ID] [--version ID]
visualize validate --file document.json
visualize present --project ID --artifact ID --version ID
visualize skill [--out DIRECTORY]
visualize install --cli PATH | --skill PATH

Use --file - to read JSON from stdin. Every command accepts --store DIRECTORY.
render and export accept --width 320..2560 and --scale 1|2. New renders default to 2x.
render accepts --mobile-width 320..600 to save a second responsive PNG.
render, export and open accept --theme light|dark.
render always saves a new immutable version with PNG and PDF snapshots.
Commands return JSON. open (the default) runs the native desktop viewer.
inspect, export and open accept --params JSON to override declared controls.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || args[0] === "help") {
    process.stdout.write(help);
    return;
  }
  if (args.length === 1 && args[0] === "--version") {
    process.stdout.write("0.1.0\n");
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
    list: ["project", "artifact", "store"],
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
    ],
    open: ["project", "artifact", "version", "store", "params", "theme"],
    validate: ["file", "store"],
    present: ["project", "artifact", "version", "store"],
    skill: ["out", "store"],
    install: ["cli", "skill", "store"],
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
  const parameters =
    options.params === undefined ? undefined : JSON.parse(options.params);
  const theme = options.theme;
  if (theme !== undefined && theme !== "light" && theme !== "dark")
    throw new Error("--theme must be light or dark");
  for (const key of ["project", "artifact"])
    if (options[key]) slug(options[key], key);
  let result: unknown;
  if (command === "render" || command === "validate") {
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
  } else if (command === "present") {
    result = present(
      root,
      required("project"),
      required("artifact"),
      required("version"),
    );
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
  } else if (command === "list")
    result = {
      store: root,
      versions: list(root, options.project, options.artifact),
    };
  else if (command === "inspect") {
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
    if (format !== "png" && format !== "pdf")
      throw new Error("--format must be png or pdf");
    const out = resolve(required("out"));
    if (!out.toLowerCase().endsWith(`.${format}`))
      throw new Error(`--out must end with .${format}`);
    if (out.startsWith(`${root}/projects/`))
      throw new Error(
        "Export outside the saved version store to preserve history",
      );
    mkdirSync(dirname(out), { recursive: true });
    const width = dimension("width", entry.width, 320, 2560),
      scale = dimension("scale", entry.scale, 1, 2);
    if (
      width === entry.width &&
      scale === entry.scale &&
      parameters === undefined &&
      theme === undefined
    )
      copyFileSync(join(entry.directory, `snapshot.${format}`), out);
    else await render(load(entry), out, width, scale, parameters, theme);
    result = {
      output: out,
      format,
      version: entry.version,
      width,
      scale,
      ...(theme ? { theme } : {}),
    };
  } else if (command === "open") {
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
    openViewer(root, { ...options, parameters, theme });
    return;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
  );
  process.exitCode = 1;
});
