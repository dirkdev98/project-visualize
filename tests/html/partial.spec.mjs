import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { comparisons, openExport, workspace } from "./helpers.mjs";

for (const width of [390, 1280])
  for (const path of ["body.north", "body.south.summary"]) {
    test(`whole-block export ${path} ${width}`, async ({ page }, testInfo) => {
      const w = workspace();
      try {
        const document = {
          schemaVersion: 1,
          type: "dashboard",
          title: "Full artifact title",
          body: [
            {
              type: "card",
              id: "north",
              title: "North observations",
              children: [
                {
                  type: "metric",
                  id: "summary",
                  label: "Accepted observations",
                  value: 12,
                },
                {
                  type: "text",
                  content: "Retained notes explain this observation.",
                },
              ],
            },
            {
              type: "card",
              id: "south",
              title: "South observations",
              children: [
                {
                  type: "chart",
                  id: "summary",
                  title: "Daily observations",
                  kind: "line",
                  labels: ["Mon", "Tue", "Wed"],
                  series: [{ name: "Accepted", values: [5, 8, 12] }],
                },
              ],
            },
          ],
        };
        const entry = w.save(document, width);
        const args = ["--block", path, "--width", String(width)];
        const native = w.cli([
          "export",
          "--project",
          entry.project,
          "--artifact",
          entry.artifact,
          "--version",
          entry.version,
          "--format",
          "png",
          "--scale",
          "1",
          ...args,
        ]);
        const html = w.html(entry, args);
        await page.setViewportSize({ width, height: 900 });
        await openExport(page, html.output);
        await expect(
          page.getByRole("heading", { name: document.title, exact: true }),
        ).toHaveCount(0);
        const image = await page.locator("#visualize").screenshot();
        await comparisons(testInfo, native.output, image);
        if (!process.env.VISUALIZE_CAPTURE_ONLY) {
          const name = `${path}-${width}`;
          expect(readFileSync(native.output)).toMatchSnapshot(
            `${name}-native.png`,
          );
          await expect(page.locator("#visualize")).toHaveScreenshot(
            `${name}-html.png`,
          );
        }
      } finally {
        w.dispose();
      }
    });
  }
