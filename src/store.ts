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
import { dirname, extname, join, resolve } from "node:path";
import type { Artifact } from "./model.ts";
import { slug } from "./model.ts";

export interface Entry {
  project: string;
  artifact: string;
  version: string;
  title: string;
  createdAt: string;
  width: number;
  height: number;
  scale: number;
  directory: string;
}

export function storeRoot(override?: string) {
  return resolve(
    override ??
      process.env.VISUALIZE_HOME ??
      join(homedir(), "Library", "Application Support", "Project Visualize"),
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
      for (const v of directories(join(projects, p, a))) {
        const directory = join(projects, p, a, v);
        entries.push({
          ...JSON.parse(readFileSync(join(directory, "metadata.json"), "utf8")),
          directory,
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
  try {
    const snapshot: Artifact = JSON.parse(JSON.stringify(document));
    for (const [name, file] of Object.entries(document.assets ?? {})) {
      const source = resolve(sourceDirectory, file);
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
      title: document.title,
      createdAt,
      width,
      height,
      scale,
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
  }
}
