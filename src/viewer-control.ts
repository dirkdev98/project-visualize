import { pv_viewer_claim, pv_viewer_release } from "maligator:ffi/visualize";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import type { Theme } from "./model.ts";
import { checked } from "./ui/primitives.ts";
import { executablePath } from "./workflow.ts";

export interface ViewerOptions {
  project?: string;
  artifact?: string;
  version?: string;
  parameters?: unknown;
  theme?: Theme;
  search?: string;
  focus?: boolean;
}
export interface ViewerRequest {
  id: string;
  session: string;
  expires: number;
  action: "open" | "status" | "capture" | "close";
  options?: ViewerOptions;
  capture?: {
    out: string;
    canvasWidth?: number;
    height?: number;
    scroll?: number | "all";
    scale: number;
  };
}
interface Owner {
  session: string;
  pid: number;
  executable: string;
}
function directory(root: string) {
  mkdirSync(root, { recursive: true });
  const location = join(realpathSync(root), ".viewer");
  mkdirSync(location, { recursive: true, mode: 0o700 });
  for (const child of ["requests", "replies"])
    mkdirSync(join(location, child), { recursive: true, mode: 0o700 });
  return location;
}
function write(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}
export function viewerRunning(root: string): boolean {
  const acquired = checked(
    pv_viewer_claim(join(directory(root), "owner.lock")),
  );
  if (acquired) pv_viewer_release();
  return acquired === 0;
}
export class ViewerController {
  readonly owner: Owner;
  readonly directory: string;
  constructor(location: string) {
    this.directory = location;
    this.owner = {
      session: randomUUID(),
      pid: process.pid,
      executable: executablePath,
    };
    write(join(location, "owner.json"), this.owner);
  }
  next(): ViewerRequest | undefined {
    for (const file of readdirSync(join(this.directory, "requests")).sort()) {
      if (!/^[a-f0-9-]+\.json$/.test(file)) continue;
      const path = join(this.directory, "requests", file);
      let request: ViewerRequest;
      try {
        request = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        rmSync(path, { force: true });
        continue;
      }
      request.id = file.slice(0, -5);
      if (request.expires < Date.now()) {
        rmSync(path, { force: true });
        continue;
      }
      if (request.session !== this.owner.session) {
        this.reply(
          request,
          undefined,
          "Viewer session changed; retry the request",
        );
        continue;
      }
      return request;
    }
  }
  reply(request: ViewerRequest, value?: unknown, error?: string) {
    write(join(this.directory, "replies", `${request.id}.json`), {
      ...this.owner,
      ...(error ? { error } : { result: value }),
    });
    rmSync(join(this.directory, "requests", `${request.id}.json`), {
      force: true,
    });
  }
  close() {
    rmSync(join(this.directory, "owner.json"), { force: true });
    // Retain the lock inode so another process cannot lock a replacement file.
    pv_viewer_release();
  }
}
export function claimViewer(root: string): ViewerController | undefined {
  const location = directory(root);
  if (!checked(pv_viewer_claim(join(location, "owner.lock")))) return undefined;
  try {
    return new ViewerController(location);
  } catch (error) {
    pv_viewer_release();
    throw error;
  }
}
export async function requestViewer(
  root: string,
  input: Omit<ViewerRequest, "id" | "session" | "expires">,
  launch = false,
): Promise<Record<string, unknown>> {
  const location = directory(root),
    deadline = Date.now() + (input.action === "capture" ? 60_000 : 10_000);
  function startIfAbsent() {
    if (viewerRunning(root)) return;
    if (!launch)
      throw new Error("No viewer is running for this library; use open first");
    const child = spawn(
      executablePath,
      ["viewer-host", "--store", realpathSync(root)],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  }
  startIfAbsent();
  while (Date.now() < deadline) {
    const ownerFile = join(location, "owner.json");
    if (!existsSync(ownerFile)) {
      await setTimeout(25);
      continue;
    }
    const owner: Owner = JSON.parse(readFileSync(ownerFile, "utf8")),
      id = randomUUID(),
      file = join(location, "requests", `${id}.json`),
      reply = join(location, "replies", `${id}.json`);
    write(file, { ...input, id, session: owner.session, expires: deadline });
    let inspected = Date.now();
    try {
      while (Date.now() < deadline) {
        if (existsSync(reply)) {
          const response = JSON.parse(readFileSync(reply, "utf8"));
          if (response.error === "Viewer session changed; retry the request")
            break;
          if (response.error) throw new Error(response.error);
          return {
            ...response.result,
            pid: response.pid,
            executable: response.executable,
            session: response.session,
          };
        }
        if (Date.now() - inspected > 500) {
          inspected = Date.now();
          if (!viewerRunning(root)) {
            startIfAbsent();
            break;
          }
        }
        await setTimeout(25);
      }
    } finally {
      rmSync(file, { force: true });
      rmSync(reply, { force: true });
    }
  }
  throw new Error(
    "The running viewer did not acknowledge the request before its deadline",
  );
}
