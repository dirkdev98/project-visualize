import { join } from "node:path";
import { fontResources, iconResources } from "../resources.ts";

export type Font = "regular" | "bold" | "italic" | "mono";
const files: Record<Font, string> = {
  regular: "IBMPlexSans-Regular.ttf",
  bold: "IBMPlexSans-SemiBold.ttf",
  italic: "IBMPlexSans-Italic.ttf",
  mono: "IBMPlexMono-Regular.ttf",
};
let directory: string | undefined;
let iconDirectory: string | undefined;
export function fontFile(font: Font): string {
  directory ??= fontResources.materialize();
  return join(directory, files[font]);
}
export function iconFontFile(): string {
  iconDirectory ??= iconResources.materialize();
  return join(iconDirectory, "lucide.ttf");
}
