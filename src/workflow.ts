import { pv_error, pv_executable_path } from "maligator:ffi/visualize";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  type Stats,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";

interface Bundle {
  package: string;
  executable: string;
  guide: string;
  examples: string;
}
const executable = pv_executable_path();
if (!executable)
  throw new Error(pv_error() ?? "Cannot locate the application executable");
export const executablePath = executable;
export function userPath(value: string) {
  return resolve(
    value === "~"
      ? homedir()
      : value.startsWith("~/")
        ? join(homedir(), value.slice(2))
        : value,
  );
}
function describeBundle(directory: string) {
  const bundle: Bundle = JSON.parse(
    readFileSync(join(directory, "bundle.json"), "utf8"),
  );
  if (bundle.package !== "project-visualize")
    throw new Error("This directory is not a Project Visualize skill bundle");
  return {
    directory,
    skill: join(directory, "SKILL.md"),
    executable: resolve(directory, bundle.executable),
    guide: resolve(directory, bundle.guide),
    examples: resolve(directory, bundle.examples),
  };
}
function copyDirectory(source: string, destination: string) {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source)) {
    const from = join(source, name),
      to = join(destination, name);
    if (statSync(from).isDirectory()) copyDirectory(from, to);
    else {
      const temporary = `${to}.${randomUUID()}.tmp`;
      try {
        copyFileSync(from, temporary);
        renameSync(temporary, to);
      } finally {
        rmSync(temporary, { force: true });
      }
    }
  }
}
export function skillResources(root: string, output?: string) {
  if (!output) {
    for (const directory of [
      join(dirname(executablePath), "../Resources/agent-skill"),
      join(dirname(executablePath), "../agent-skill"),
    ])
      if (existsSync(join(directory, "bundle.json")))
        return describeBundle(resolve(directory));
  }
  const destination = userPath(
    output ?? join(root, "integrations", "agent-skill"),
  );
  if (
    destination === join(root, "projects") ||
    destination.startsWith(`${join(root, "projects")}/`)
  )
    throw new Error("Extract the skill outside saved artifact versions");
  if (existsSync(destination)) {
    if (
      lstatSync(destination).isSymbolicLink() ||
      !statSync(destination).isDirectory()
    )
      throw new Error("Choose a directory for the skill bundle");
    if (
      readdirSync(destination).length &&
      !existsSync(join(destination, "bundle.json"))
    )
      throw new Error("The skill destination is not empty");
    if (existsSync(join(destination, "bundle.json")))
      describeBundle(destination);
  }
  copyDirectory(mal.assets.materialize("workflow"), destination);
  writeFileSync(
    join(destination, "bundle.json"),
    `${JSON.stringify({ package: "project-visualize", executable: executablePath, guide: "docs/artifacts.md", examples: "examples" }, null, 2)}\n`,
  );
  return describeBundle(destination);
}
export function defaultCliDestination() {
  const home = homedir();
  const directories = [join(home, ".local", "bin"), join(home, "bin")];
  return join(
    directories.find((directory) =>
      process.env.PATH?.split(delimiter).includes(directory),
    ) ?? directories[0],
    "visualize",
  );
}
export function defaultSkillDestination() {
  return join(homedir(), ".agents", "skills", "project-visualize");
}
export function linkInstallation(source: string, destination: string) {
  source = resolve(source);
  destination = userPath(destination);
  let existing: Stats | undefined;
  try {
    existing = lstatSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing) {
    if (
      existing.isSymbolicLink() &&
      resolve(dirname(destination), readlinkSync(destination)) === source
    )
      return { source, destination, status: "already-linked" };
    throw new Error(
      `Destination already exists; choose another location: ${destination}`,
    );
  }
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(source, destination);
  return { source, destination, status: "linked" };
}
export function linkCommand(source: string, destination: string) {
  return `mkdir -p ${shellQuote(dirname(userPath(destination)))} && ln -s ${shellQuote(source)} ${shellQuote(userPath(destination))}`;
}
export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
