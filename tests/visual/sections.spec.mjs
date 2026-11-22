import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openExport, workspace } from "./helpers.mjs";

const review = JSON.parse(
  readFileSync(
    new URL("../../examples/widgets/section.json", import.meta.url),
    "utf8",
  ),
);

test("HTML reports scroll through all sections by default", async ({
  page,
}) => {
  const w = workspace();
  try {
    await openExport(page, w.html(w.save(review)).output);
    for (const section of review.body.filter(
      (block) => block.type === "section",
    ))
      await expect(
        page.getByRole("heading", { name: section.title }),
      ).toBeVisible();
    await expect(page.getByRole("tablist")).toHaveCount(0);
  } finally {
    w.dispose();
  }
});

test("HTML tabs preserve shared filters when switching sections by keyboard or pointer", async ({
  page,
}) => {
  const w = workspace();
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    const output = w.html(w.save(review, 390), ["--html-layout", "tabs"]);
    await openExport(page, output.output);
    const evidence = page.getByRole("tab", { name: "Evidence" });
    const checks = page.getByRole("tab", { name: "Checks" });
    const filters = page.getByRole("combobox", {
      name: "Station",
      exact: true,
    });
    await expect(evidence).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Checks" })).toBeHidden();
    await expect(page.getByText(review.body[0].content)).toBeVisible();
    await filters.selectOption({ label: "Cedar" });
    await expect(page.getByRole("table")).toContainText("Cedar");
    await expect(page.getByRole("table")).not.toContainText("Birch");
    await evidence.press("ArrowRight");
    await expect(checks).toBeFocused();
    await expect(page.getByRole("tabpanel", { name: "Checks" })).toBeVisible();
    const total = review.datasets.stations.find(
      ({ station }) => station === "Cedar",
    ).checked;
    await expect(
      page.getByRole("region", { name: "Checked observations" }),
    ).toContainText(String(total));
    await expect(page.getByText(review.body[0].content)).toBeVisible();
    await evidence.click();
    await expect(page.getByRole("table")).not.toContainText("Birch");
  } finally {
    w.dispose();
  }
});

test("printing tabbed HTML includes every section", async ({ page }) => {
  const w = workspace();
  try {
    const output = w.html(w.save(review), ["--html-layout", "tabs"]);
    await openExport(page, output.output);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("tablist")).toBeHidden();
    for (const section of review.body.filter(
      (block) => block.type === "section",
    ))
      await expect(
        page.getByRole("heading", { name: section.title }),
      ).toBeVisible();
  } finally {
    w.dispose();
  }
});
