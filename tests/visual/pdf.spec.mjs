import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixtures, renderCases } from "./fixtures.mjs";
import { workspace } from "./helpers.mjs";
import { pdfPages } from "./native-captures.mjs";

for (const { name, theme, width } of renderCases()) {
  test(`PDF ${name} ${theme} ${width}`, async () => {
    const testInfo = test.info();
    const w = workspace();
    try {
      const fixture = fixtures(w.directory).find(
        (fixture) => fixture.name === name,
      );
      const entry = w.save(fixture.document, width, theme);
      const pages = pdfPages(entry.pdf, testInfo.outputPath("page"));
      expect(pages.length).toBeGreaterThan(0);
      const stem = `${name}-${theme}-${width}-pdf`;
      for (const [index, page] of pages.entries()) {
        await testInfo.attach(`PDF page ${index + 1}`, {
          path: page,
          contentType: "image/png",
        });
        if (!process.env.VISUALIZE_CAPTURE_ONLY)
          expect(readFileSync(page)).toMatchSnapshot(
            `${stem}-${index + 1}.png`,
          );
      }
      if (!process.env.VISUALIZE_CAPTURE_ONLY)
        expect(
          JSON.stringify(pages.map((_, index) => index + 1)),
        ).toMatchSnapshot(`${stem}-pages.json`);
    } finally {
      w.dispose();
    }
  });
}
