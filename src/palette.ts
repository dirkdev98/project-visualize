import type { Theme } from "./model.ts";

export const palettes = {
  light: {
    ink: "#24242b",
    muted: "#696974",
    accent: "#6554c0",
    paper: "#f7f7f9",
    surface: "#ffffff",
    onAccent: "#ffffff",
    border: "#e2e2e8",
    diagramBorder: "#b0b0bd",
    diagramLabel: "#454550",
    blue: "#287f9c",
    positive: "#39805e",
    negative: "#c3444d",
    warning: "#9a6417",
    code: "#efeff3",
  },
  dark: {
    ink: "#ededf0",
    muted: "#a6a6b0",
    accent: "#ae9ff4",
    paper: "#18181b",
    surface: "#232327",
    onAccent: "#24202f",
    border: "#38383f",
    diagramBorder: "#686877",
    diagramLabel: "#d6d6e0",
    blue: "#68bcd0",
    positive: "#91c8a4",
    negative: "#f28b91",
    warning: "#e8b56a",
    code: "#202023",
  },
};

export function chartColors(theme: Theme): string[] {
  const colors = palettes[theme];
  return [
    colors.accent,
    colors.blue,
    ...(theme === "light"
      ? ["#bd743b", "#ad5681", "#5c8552", "#5576c9"]
      : ["#e5a66f", "#dc8fb6", "#9abd85", "#8aaaf0"]),
  ];
}
