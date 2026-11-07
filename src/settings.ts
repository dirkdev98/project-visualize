import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Theme } from "./model.ts";

export type Appearance = "system" | Theme;
export interface Settings {
  appearance: Appearance;
  wheelScale: number;
  cliDestination?: string;
  skillDestination?: string;
}
function validateSettings(settings: Settings) {
  if (!["system", "light", "dark"].includes(settings.appearance))
    throw new Error("Appearance must be system, light or dark");
  if (
    !Number.isFinite(settings.wheelScale) ||
    settings.wheelScale < 0.05 ||
    settings.wheelScale > 1
  )
    throw new Error("Scroll speed must be between 5 and 100 percent");
  return settings;
}
export function readSettings(root: string): Settings {
  const file = join(root, "settings.json");
  return validateSettings({
    appearance: "system",
    wheelScale: process.platform === "darwin" ? 0.2 : 1,
    ...(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}),
  });
}
export function saveSettings(root: string, patch: Partial<Settings>) {
  const settings = validateSettings({ ...readSettings(root), ...patch });
  mkdirSync(root, { recursive: true });
  const temporary = join(root, `.settings-${randomUUID()}.json`);
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`);
    renameSync(temporary, join(root, "settings.json"));
  } finally {
    rmSync(temporary, { force: true });
  }
  return settings;
}
export function systemTheme(): Theme {
  if (process.platform === "darwin") {
    const result = spawnSync(
      "/usr/bin/defaults",
      ["read", "-g", "AppleInterfaceStyle"],
      { encoding: "utf8", timeout: 2000 },
    );
    if (result.status === 0 && result.stdout.trim().toLowerCase() === "dark")
      return "dark";
  }
  return "light";
}
export function creationTheme(root: string): Theme {
  const preference = readSettings(root).appearance;
  return preference === "system" ? systemTheme() : preference;
}
