import {
  igButton,
  igGetCursorPosX,
  igIsItemDeactivatedAfterEdit,
  igIsItemHovered,
  igRadioButton_Bool,
  igSameLine,
  igSetClipboardText,
  igSetNextItemWidth,
  igSpacing,
  pv_slider_double,
} from "maligator:ffi/visualize";
import { delimiter, dirname } from "node:path";
import type { Appearance, Settings } from "../settings.ts";
import {
  defaultCliDestination,
  defaultSkillDestination,
  executablePath,
  linkCommand,
  linkInstallation,
  shellQuote,
  skillResources,
  userPath,
} from "../workflow.ts";
import { iconButton } from "./icons.ts";
import {
  available,
  input,
  inputBuffer,
  inputValue,
  panel,
  text,
  tooltip,
} from "./primitives.ts";
import { palette } from "./theme.ts";

export class SettingsPanel {
  private root: string;
  private cli: Int8Array;
  private skill: Int8Array;
  private message = "";
  private failed = false;
  private resources: ReturnType<typeof skillResources> | undefined;
  private change: (patch: Partial<Settings>, persist?: boolean) => void;
  private close: () => void;
  constructor(
    root: string,
    settings: Settings,
    change: (patch: Partial<Settings>, persist?: boolean) => void,
    close: () => void,
  ) {
    this.root = root;
    this.cli = inputBuffer(
      settings.cliDestination ?? defaultCliDestination(),
      4096,
    );
    this.skill = inputBuffer(
      settings.skillDestination ?? defaultSkillDestination(),
      4096,
    );
    this.change = change;
    this.close = close;
  }
  private action(body: () => string) {
    try {
      this.message = body();
      this.failed = false;
    } catch (cause) {
      this.message = cause instanceof Error ? cause.message : String(cause);
      this.failed = true;
    }
  }
  body(settings: Settings) {
    const start = igGetCursorPosX(),
      width = available();
    text("Settings", 32, "bold");
    igSameLine(Math.max(start, start + width - 32), -1);
    if (iconButton("##close-settings", "close", "Close · Esc", { size: 32 }))
      this.close();
    igSpacing();
    panel(() => {
      text("Appearance", 20, "bold");
      const modes: { value: Appearance; label: string }[] = [
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ];
      const inline = available() > 340;
      for (let i = 0; i < modes.length; i++) {
        if (i && inline) igSameLine(0, -1);
        if (
          igRadioButton_Bool(
            modes[i].label,
            settings.appearance === modes[i].value,
          )
        )
          this.action(() => {
            this.change({ appearance: modes[i].value });
            return "Appearance saved.";
          });
      }
      text(
        "Choose the viewer appearance and the default for new captures.",
        15,
        "regular",
        palette.muted,
      );
      igSpacing();
      const speed = pv_slider_double(
        "Scroll speed (%)",
        settings.wheelScale * 100,
        5,
        100,
      );
      if (speed.result) this.change({ wheelScale: speed.value / 100 }, false);
      if (igIsItemDeactivatedAfterEdit())
        this.action(() => {
          this.change({ wheelScale: speed.value / 100 });
          return "Scroll speed saved.";
        });
    });
    igSpacing();
    panel(() => {
      text("Command line", 20, "bold");
      text(
        "Link the bundled executable into a user directory on PATH.",
        15,
        "regular",
        palette.muted,
      );
      text("CLI destination", 13, "bold");
      igSetNextItemWidth(-1);
      input("##cli-destination", "Path to the visualize command", this.cli);
      if (igIsItemHovered(0)) tooltip(inputValue(this.cli));
      const destination = inputValue(this.cli);
      if (igButton("Install CLI", { x: 0, y: 0 }))
        this.action(() => {
          const result = linkInstallation(executablePath, destination);
          this.change({ cliDestination: result.destination });
          return result.status === "already-linked"
            ? `CLI already linked at ${result.destination}`
            : `CLI linked at ${result.destination}`;
        });
      if (available() > 300) igSameLine(0, -1);
      if (igButton("Copy CLI command", { x: 0, y: 0 }))
        igSetClipboardText(linkCommand(executablePath, destination));
      const directory = dirname(userPath(destination));
      if (!process.env.PATH?.split(delimiter).includes(directory)) {
        text(
          "Add this directory to PATH to use visualize from a shell.",
          15,
          "regular",
          palette.muted,
        );
        if (igButton("Copy PATH command", { x: 0, y: 0 }))
          igSetClipboardText(`export PATH=${shellQuote(directory)}:"$PATH"`);
      }
    });
    igSpacing();
    panel(() => {
      text("Agent skill", 20, "bold");
      text(
        "Link the bundled workflow into a skill directory. Existing destinations are kept.",
        15,
        "regular",
        palette.muted,
      );
      text("Skill destination", 13, "bold");
      igSetNextItemWidth(-1);
      input(
        "##skill-destination",
        "Path to the project-visualize skill",
        this.skill,
      );
      if (igIsItemHovered(0)) tooltip(inputValue(this.skill));
      const destination = inputValue(this.skill);
      if (igButton("Link skill", { x: 0, y: 0 }))
        this.action(() => {
          this.resources ??= skillResources(this.root);
          const result = linkInstallation(
            this.resources.directory,
            destination,
          );
          this.change({ skillDestination: result.destination });
          return result.status === "already-linked"
            ? `Skill already linked at ${result.destination}`
            : `Skill linked at ${result.destination}`;
        });
      if (available() > 300) igSameLine(0, -1);
      if (igButton("Copy skill command", { x: 0, y: 0 }))
        this.action(() => {
          this.resources ??= skillResources(this.root);
          igSetClipboardText(
            linkCommand(this.resources.directory, destination),
          );
          return "Skill link command copied.";
        });
    });
    if (this.message) {
      igSpacing();
      text(
        this.message,
        16,
        "regular",
        this.failed ? palette.negative : palette.positive,
      );
    }
  }
}
