import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixtures, renderCases } from "./fixtures.mjs";
import { comparisons, openExport, workspace } from "./helpers.mjs";

for (const { name, theme, width } of renderCases()) {
  test(`${name} ${theme} ${width}`, async ({ page }, testInfo) => {
    const w = workspace();
    try {
      const fixture = fixtures(w.directory).find(
        (fixture) => fixture.name === name,
      );
      const entry = w.save(fixture.document, width, theme);
      const output = w.html(entry);
      await page.setViewportSize({ width, height: 900 });
      const evidence = await openExport(page, output.output);
      expect(evidence.errors).toEqual([]);
      expect(evidence.requests).toEqual([]);
      await expect(
        page
          .getByRole("heading", {
            name: fixture.document.title,
            exact: true,
          })
          .first(),
      ).toBeVisible();
      const overflow = await page.locator("#visualize").evaluate((root) =>
        [...root.querySelectorAll("section,table,input,select,img")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.width > 0 &&
              (rect.left < -0.5 ||
                rect.right > innerWidth + 0.5 ||
                element.scrollWidth > element.clientWidth + 2)
            );
          })
          .map((element) => ({
            tag: element.tagName,
            label: element.getAttribute("aria-label"),
            width: element.clientWidth,
            scroll: element.scrollWidth,
          })),
      );
      expect(overflow).toEqual([]);
      const clippedLabels = await page.locator("#visualize").evaluate((root) =>
        [...root.querySelectorAll("svg text")]
          .filter((text) => {
            const bounds = text.getBoundingClientRect(),
              viewport = text.ownerSVGElement.getBoundingClientRect();
            return (
              bounds.width > 0 &&
              (bounds.left < viewport.left - 1 ||
                bounds.right > viewport.right + 1 ||
                bounds.top < viewport.top - 1 ||
                bounds.bottom > viewport.bottom + 1)
            );
          })
          .map((text) => text.textContent),
      );
      expect(clippedLabels).toEqual([]);
      const image = await page.locator("#visualize").screenshot();
      const heightRatio =
        image.readUInt32BE(20) / readFileSync(entry.png).readUInt32BE(20);
      expect(heightRatio, "native/browser layout height ratio").toBeGreaterThan(
        0.8,
      );
      expect(heightRatio, "native/browser layout height ratio").toBeLessThan(
        1.2,
      );
      await comparisons(testInfo, entry.png, image);
      if (!process.env.VISUALIZE_CAPTURE_ONLY) {
        expect(readFileSync(entry.png)).toMatchSnapshot(
          `${name}-${theme}-${width}-native.png`,
        );
        await expect(page.locator("#visualize")).toHaveScreenshot(
          `${name}-${theme}-${width}-html.png`,
        );
      }
    } finally {
      w.dispose();
    }
  });
}
