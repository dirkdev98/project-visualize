import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { ImageCache } from "./images.ts";
import type { Artifact, ArtifactType, Theme } from "./model.ts";
import { slug } from "./model.ts";

export interface Entry {
  project: string;
  artifact: string;
  version: string;
  type?: ArtifactType;
  title: string;
  createdAt: string;
  width: number;
  height: number;
  scale: number;
  theme?: Theme;
  mobile?: { width: number; height: number };
  directory: string;
  presentedAt?: string;
  currentPresentation?: boolean;
  archivedAt?: string;
}

export function archive(
  root: string,
  project: string,
  artifact: string,
  archived: boolean,
): Entry {
  const entry = find(root, project, artifact);
  const parent = dirname(entry.directory),
    file = join(parent, "archived.json");
  if (!archived) {
    rmSync(file, { force: true });
    const { archivedAt: _, ...rest } = entry;
    return rest;
  }
  const archivedAt = entry.archivedAt ?? new Date().toISOString(),
    temporary = join(parent, `.archived-${randomUUID()}.json`);
  try {
    writeFileSync(temporary, `${JSON.stringify({ archivedAt })}\n`);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { ...entry, archivedAt };
}

interface Presentation {
  version: string;
  versions: Record<string, string>;
}
function presentation(parent: string): Presentation | undefined {
  const file = join(parent, "presented.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}
export function present(
  root: string,
  project: string,
  artifact: string,
  version: string,
): Entry {
  const entry = find(root, project, artifact, version);
  const parent = dirname(entry.directory);
  const previous = presentation(parent);
  const presentedAt = new Date().toISOString();
  const temporary = join(parent, `.presented-${randomUUID()}.json`);
  try {
    writeFileSync(
      temporary,
      `${JSON.stringify({ version, versions: { ...previous?.versions, [version]: presentedAt } }, null, 2)}\n`,
    );
    renameSync(temporary, join(parent, "presented.json"));
  } finally {
    rmSync(temporary, { force: true });
  }
  return { ...entry, presentedAt, currentPresentation: true };
}

export function storeRoot(override?: string) {
  return resolve(
    override ??
      process.env.VISUALIZE_HOME ??
      (process.platform === "linux"
        ? join(
            process.env.XDG_DATA_HOME && isAbsolute(process.env.XDG_DATA_HOME)
              ? process.env.XDG_DATA_HOME
              : join(homedir(), ".local", "share"),
            "project-visualize",
          )
        : join(
            homedir(),
            "Library",
            "Application Support",
            "Project Visualize",
          )),
  );
}

function directories(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(
    (name) => !name.startsWith(".") && statSync(join(root, name)).isDirectory(),
  );
}

export function list(
  root: string,
  project?: string,
  artifact?: string,
): Entry[] {
  if (project) slug(project, "project");
  if (artifact) slug(artifact, "artifact");
  const projects = join(root, "projects");
  const entries: Entry[] = [];
  for (const p of directories(projects)) {
    if (project && p !== project) continue;
    for (const a of directories(join(projects, p))) {
      if (artifact && a !== artifact) continue;
      const presented = presentation(join(projects, p, a));
      const archiveFile = join(projects, p, a, "archived.json");
      const archived = existsSync(archiveFile)
        ? JSON.parse(readFileSync(archiveFile, "utf8"))
        : undefined;
      for (const v of directories(join(projects, p, a))) {
        const directory = join(projects, p, a, v);
        entries.push({
          ...JSON.parse(readFileSync(join(directory, "metadata.json"), "utf8")),
          directory,
          ...(archived ? { archivedAt: archived.archivedAt } : {}),
          ...(presented?.versions[v]
            ? {
                presentedAt: presented.versions[v],
                currentPresentation: presented.version === v,
              }
            : {}),
        });
      }
    }
  }
  return entries.sort((a, b) => b.version.localeCompare(a.version));
}

export function find(
  root: string,
  project: string,
  artifact: string,
  version?: string,
): Entry {
  const entries = list(root, project, artifact);
  const entry = version
    ? entries.find((entry) => entry.version === version)
    : entries[0];
  if (!entry)
    throw new Error(
      `No saved version for ${project}/${artifact}${version ? ` at ${version}` : ""}`,
    );
  return entry;
}

export function load(entry: Entry): Artifact {
  const doc: Artifact = JSON.parse(
    readFileSync(join(entry.directory, "document.json"), "utf8"),
  );
  doc.theme ??= entry.theme;
  for (const [name, file] of Object.entries(doc.assets ?? {})) {
    if (doc.assets) doc.assets[name] = resolve(entry.directory, file);
  }
  return doc;
}

export async function save(
  root: string,
  project: string,
  artifact: string,
  document: Artifact,
  sourceDirectory: string,
  width: number,
  scale: number,
  render: (
    document: Artifact,
    outputs: string[],
    width: number,
    scale: number,
  ) => Promise<number>,
  options: { mobileWidth?: number; theme?: Theme } = {},
): Promise<Entry> {
  slug(project, "project");
  slug(artifact, "artifact");
  const createdAt = new Date().toISOString();
  const version = `${createdAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const parent = join(root, "projects", project, artifact);
  mkdirSync(parent, { recursive: true });
  const pending = join(parent, `.pending-${version}`);
  const directory = join(parent, version);
  mkdirSync(pending);
  const images = new ImageCache(root);
  try {
    const snapshot: Artifact = JSON.parse(JSON.stringify(document));
    for (const [name, file] of Object.entries(document.assets ?? {})) {
      const source = /^https?:\/\//i.test(file)
        ? await images.resolve(file)
        : resolve(sourceDirectory, file);
      const extension = extname(source).toLowerCase();
      if (![".png", ".jpg", ".jpeg"].includes(extension))
        throw new Error(`Asset ${name}: use PNG or JPEG`);
      if (statSync(source).size > 20 * 1024 * 1024)
        throw new Error(`Asset ${name} exceeds 20 MiB`);
      const relative = join("assets", `${name}${extension}`);
      const destination = join(pending, relative);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
      if (snapshot.assets) snapshot.assets[name] = relative;
    }
    writeFileSync(
      join(pending, "document.json"),
      `${JSON.stringify(snapshot, null, 2)}\n`,
    );
    const hydrated: Artifact = JSON.parse(JSON.stringify(snapshot));
    const theme = snapshot.theme ?? options.theme ?? "light";
    hydrated.theme = theme;
    for (const [name, file] of Object.entries(hydrated.assets ?? {})) {
      if (hydrated.assets) hydrated.assets[name] = join(pending, file);
    }
    const height = await render(
      hydrated,
      [join(pending, "snapshot.png"), join(pending, "snapshot.pdf")],
      width,
      scale,
    );
    const entry = {
      project,
      artifact,
      version,
      type: document.type,
      title: document.title,
      createdAt,
      width,
      height,
      scale,
      theme,
      ...(options.mobileWidth === undefined
        ? {}
        : {
            mobile: {
              width: options.mobileWidth,
              height: await render(
                hydrated,
                [join(pending, "snapshot-mobile.png")],
                options.mobileWidth,
                scale,
              ),
            },
          }),
    };
    writeFileSync(
      join(pending, "metadata.json"),
      `${JSON.stringify(entry, null, 2)}\n`,
    );
    renameSync(pending, directory);
    return { ...entry, directory };
  } catch (error) {
    rmSync(pending, { recursive: true, force: true });
    throw error;
  } finally {
    await images.settle();
  }
}
