import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixtures } from "./fixtures.mjs";
import { openExport, workspace } from "./helpers.mjs";
import { artifactViewport, pdfPages } from "./native-captures.mjs";

test.use({ deviceScaleFactor: 2 });
test("Retina density preserves the layout in every renderer", async ({
  page,
}) => {
  const info = test.info(),
    w = workspace();
  let running = false;
  try {
    const fixture = fixtures(w.directory).find(
      (fixture) => fixture.name === "images-and-layout",
    );
    const entry = w.save(fixture.document, 768, "light", 2);
    await page.setViewportSize({ width: 768, height: 900 });
    await openExport(page, w.html(entry).output);
    expect(readFileSync(entry.png).readUInt32BE(16)).toBe(768 * entry.scale);
    expect(readFileSync(entry.png)).toMatchSnapshot("retina-native.png");
    await expect(page.locator("#visualize")).toHaveScreenshot(
      "retina-html.png",
    );
    const pages = pdfPages(entry.pdf, info.outputPath("pdf"));
    for (const [index, file] of pages.entries())
      expect(readFileSync(file)).toMatchSnapshot(`retina-pdf-${index + 1}.png`);
    expect(JSON.stringify(pages.map((_, index) => index + 1))).toMatchSnapshot(
      "retina-pdf-pages.json",
    );
    w.cli(["open", "--focus", "false"]);
    running = true;
    const capture = w.cli([
      "viewer",
      "--action",
      "capture",
      "--project",
      entry.project,
      "--artifact",
      entry.artifact,
      "--version",
      entry.version,
      "--theme",
      "light",
      "--focus",
      "false",
      "--content-width",
      "696",
      "--height",
      "900",
      "--scroll",
      "all",
      "--scale",
      "2",
      "--out",
      info.outputPath("app.png"),
    ]);
    for (const [index, file] of capture.files.entries())
      expect(
        artifactViewport(file, file.canvas, capture.scale),
      ).toMatchSnapshot(`retina-app-${index + 1}.png`);
    expect(
      JSON.stringify(capture.files.map((_, index) => index + 1)),
    ).toMatchSnapshot("retina-app-viewports.json");
  } finally {
    try {
      if (running) w.cli(["viewer", "--action", "close"]);
    } finally {
      w.dispose();
    }
  }
});
