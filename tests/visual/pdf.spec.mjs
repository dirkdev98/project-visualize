import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixtures, renderCases } from "./fixtures.mjs";
import { workspace } from "./helpers.mjs";
import { pdfPages } from "./native-captures.mjs";

// PDFs lay out at their paper's width, so each fixture and theme has one PDF
// whatever width the PNG uses; portrait paper adds its own narrower layout.
const cases = [
  ...new Map(
    renderCases().map(({ name, theme }) => [
      `${name}-${theme}`,
      { name, theme, paper: undefined },
    ]),
  ).values(),
  ...["light", "dark"].map((theme) => ({
    name: "notebook",
    theme,
    paper: { paper: "a4", orientation: "portrait" },
  })),
];

for (const { name, theme, paper } of cases) {
  const variant = paper ? `${name}-portrait` : name;
  test(`PDF ${variant} ${theme}`, async () => {
    const testInfo = test.info();
    const w = workspace();
    try {
      const fixture = fixtures(w.directory).find(
        (fixture) => fixture.name === name,
      );
      const document = paper
        ? { ...fixture.document, pdf: paper }
        : fixture.document;
      const entry = w.save(document, 1280, theme);
      const pages = pdfPages(entry.pdf, testInfo.outputPath("page"));
      expect(pages.length).toBeGreaterThan(0);
      const stem = `${variant}-${theme}-pdf`;
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
