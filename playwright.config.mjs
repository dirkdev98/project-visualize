import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/html",
  timeout: 30_000,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: ".cache/html-report", open: "never" }],
  ],
  outputDir: ".cache/html-results",
  snapshotPathTemplate: "{testDir}/snapshots/{platform}/{arg}{ext}",
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  },
  expect: {
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.005 },
    toMatchSnapshot: { maxDiffPixelRatio: 0.005 },
  },
});
