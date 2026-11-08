import { expect, test } from "@playwright/test";
import { fixtures, renderCases } from "./fixtures.mjs";
import { workspace } from "./helpers.mjs";
import { artifactViewport } from "./native-captures.mjs";

let w, owner;
test.beforeAll(() => {
  w = workspace();
  owner = w.cli(["open", "--focus", "false"]);
});
test.afterAll(() => {
  try {
    w?.cli(["viewer", "--action", "close"]);
  } finally {
    w?.dispose();
  }
});

for (const { name, theme, width } of renderCases()) {
  test(`app ${name} ${theme} ${width}`, async () => {
    const testInfo = test.info();
    const fixture = fixtures(w.directory).find(
      (fixture) => fixture.name === name,
    );
    const entry = w.save(fixture.document, width, theme);
    const contentWidth = width - (width < 480 ? 32 : 72);
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
      theme,
      "--focus",
      "false",
      "--content-width",
      String(contentWidth),
      "--height",
      "900",
      "--scroll",
      "all",
      "--out",
      testInfo.outputPath("app.png"),
    ]);
    expect(capture.pid).toBe(owner.pid);
    expect(capture.selected.version).toBe(entry.version);
    expect(capture.kind).toBe("viewer-draw-data");
    expect(capture.files.length).toBeGreaterThan(0);
    const last = capture.files.at(-1).canvas;
    expect(last.scroll).toBeGreaterThanOrEqual(last.scrollMax - 1);
    for (const [index, file] of capture.files.entries()) {
      expect(file.canvas.width).toBe(contentWidth);
      const image = artifactViewport(file, file.canvas, capture.scale);
      await testInfo.attach(`App viewport ${index + 1}`, {
        body: image,
        contentType: "image/png",
      });
      if (!process.env.VISUALIZE_CAPTURE_ONLY)
        expect(image).toMatchSnapshot(
          `${name}-${theme}-${width}-app-${index + 1}.png`,
        );
    }
    if (!process.env.VISUALIZE_CAPTURE_ONLY)
      expect(
        JSON.stringify(capture.files.map((_, index) => index + 1)),
      ).toMatchSnapshot(`${name}-${theme}-${width}-app-viewports.json`);
  });
}
