import { readFileSync, rmSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixtures, linkedFixture as linked } from "./fixtures.mjs";
import { openExport, workspace } from "./helpers.mjs";

test("typed linked selections retain chart context and clear by clicking outside", async ({
  page,
}) => {
  const w = workspace();
  try {
    const output = w.html(w.save(linked()));
    await openExport(page, output.output);
    await page
      .getByRole("combobox", { name: "Segment", exact: true })
      .selectOption({ label: "1 (number)" });
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("12");
    await expect(page.getByRole("table")).toContainText("Cedar");
    await expect(page.getByRole("table")).not.toContainText("Birch");
    const chart = page.getByRole("img", { name: "Segment comparison" });
    await expect(chart.getByRole("button")).toHaveCount(
      linked().datasets.observations.length,
    );
    await chart.click({ position: { x: 2, y: 2 } });
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("114");
    await page
      .getByRole("combobox", { name: "Segment", exact: true })
      .selectOption({ label: "1 (string)" });
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("2");
  } finally {
    w.dispose();
  }
});

test("search toggle and inclusive range controls compose without losing input focus", async ({
  page,
}) => {
  const w = workspace();
  try {
    const output = w.html(w.save(linked()));
    await openExport(page, output.output);
    const search = page.getByLabel("Find station", { exact: true });
    await search.fill("ar");
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("ar");
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("12");
    await search.fill("");
    await page.getByLabel("Active only").check();
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("112");
    await page.getByLabel("Maximum", { exact: true }).fill("12");
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("12");
    await page.getByLabel("Minimum", { exact: true }).fill("12");
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("12");
  } finally {
    w.dispose();
  }
});

test("table sorting follows raw numeric values", async ({ page }) => {
  const w = workspace();
  try {
    const output = w.html(w.save(linked()));
    await openExport(page, output.output);
    await page.getByRole("button", { name: "Amount", exact: true }).click();
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows.nth(1)).toContainText("Birch");
    await expect(rows.nth(2)).toContainText("Cedar");
    await expect(rows.nth(3)).toContainText("Maple");
    await page.getByRole("button", { name: "Amount ↑", exact: true }).click();
    await expect(rows.nth(1)).toContainText("Maple");
  } finally {
    w.dispose();
  }
});

test("table search matches formatted numbers and keeps the search field focused", async ({
  page,
}) => {
  const w = workspace();
  try {
    const entry = w.save({
      schemaVersion: 1,
      type: "document",
      title: "Station balances",
      body: [
        {
          type: "table",
          title: "Balances",
          columns: [
            { key: "station", label: "Station" },
            {
              key: "amount",
              label: "Amount",
              format: { prefix: "$", decimals: 2 },
            },
          ],
          rows: [12, 2, 100, 4, 5, 6].map((amount, index) => ({
            station: `Station ${index + 1}`,
            amount,
          })),
        },
      ],
    });
    await openExport(page, w.html(entry).output);
    const search = page.getByRole("searchbox", { name: "Search Balances" });
    await search.fill("$12.00");
    await expect(search).toBeFocused();
    const table = page.getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table).toContainText("Station 1");
    await expect(table).not.toContainText("Station 2");
  } finally {
    w.dispose();
  }
});

test("a selected card retains its internal controls and excludes unrelated data", async ({
  page,
}) => {
  const w = workspace();
  try {
    const document = linked();
    for (const row of document.datasets.observations)
      row.hidden = "Unrelated retained column";
    document.body = [
      {
        type: "card",
        id: "selected",
        title: "Selected card",
        children: document.body,
      },
      {
        type: "text",
        id: "private",
        content: "Unrelated confidential observation",
      },
    ];
    const entry = w.save(document);
    const output = w.html(entry, ["--block", "body.selected"]);
    expect(readFileSync(output.output, "utf8")).not.toContain(
      "Unrelated confidential observation",
    );
    expect(readFileSync(output.output, "utf8")).not.toContain(
      "Unrelated retained column",
    );
    await openExport(page, output.output);
    await expect(
      page.getByRole("heading", { name: document.title, exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Segment", exact: true })
      .selectOption({ label: "1 (number)" });
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("12");
  } finally {
    w.dispose();
  }
});

test("exporting a widget applies controls outside its card", async ({
  page,
}) => {
  const w = workspace();
  try {
    const entry = w.save(linked());
    const output = w.html(entry, [
      "--block",
      "body.total",
      "--params",
      JSON.stringify({ segment: 1 }),
    ]);
    await openExport(page, output.output);
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("12");
    await expect(page.getByRole("table")).toHaveCount(0);
    expect(readFileSync(output.output, "utf8")).not.toContain("Maple");
  } finally {
    w.dispose();
  }
});

test("a card's local filter updates comparison charts whose selection control is outside", async ({
  page,
}) => {
  const w = workspace();
  try {
    const document = linked(),
      controls = document.body[0].children;
    const segment = { ...controls[0], default: 1 };
    document.body = [
      segment,
      {
        type: "card",
        id: "selected",
        title: "Selected observations",
        children: [controls[1], ...document.body.slice(1)],
      },
    ];
    const entry = w.save(document),
      output = w.html(entry, ["--block", "body.selected"]);
    await openExport(page, output.output);
    const metric = page.getByRole("region", { name: "Total amount" }),
      chart = page.getByRole("img", { name: "Segment comparison" });
    await expect(metric).toContainText("12");
    await expect(chart).toContainText("Empty");
    await page.getByRole("searchbox", { name: "Find station" }).fill("Birch");
    await expect(metric).toContainText("0");
    await expect(chart).not.toContainText("Empty");
  } finally {
    w.dispose();
  }
});

test("retained image assets load offline after original files are deleted", async ({
  page,
}) => {
  const w = workspace();
  try {
    const fixture = fixtures(w.directory).find(
      (fixture) => fixture.name === "images-and-layout",
    );
    const entry = w.save(fixture.document);
    const output = w.html(entry);
    rmSync(fixture.document.assets.sample);
    const evidence = await openExport(page, output.output);
    expect(evidence.requests).toEqual([]);
    expect(
      await page
        .getByRole("img", { name: "Natural size" })
        .evaluate((image) => image.complete && image.naturalWidth > 0),
    ).toBe(true);
  } finally {
    w.dispose();
  }
});

test("Markdown HTML and executable-looking labels stay literal", async ({
  page,
}) => {
  const w = workspace();
  try {
    const entry = w.save({
      schemaVersion: 1,
      type: "document",
      title: "Literal content",
      body: [
        {
          type: "markdown",
          content:
            '<img src=x onerror="window.unexpected=true">\n\n[Unsafe](javascript:alert(1))',
        },
        {
          type: "text",
          content: "</script><script>window.unexpected=true</script>",
        },
        {
          type: "code",
          language: "html",
          content: "<script>window.unexpected=true</script>",
        },
      ],
    });
    const output = w.html(entry);
    const evidence = await openExport(page, output.output);
    expect(await page.evaluate(() => window.unexpected)).toBeUndefined();
    expect(evidence.requests).toEqual([]);
    expect(evidence.errors).toEqual([]);
    await expect(
      page.getByRole("region", { name: "markdown", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "markdown", exact: true }),
    ).toContainText('<img src=x onerror="window.unexpected=true">');
    await expect(page.getByRole("link", { name: "Unsafe" })).toHaveCount(0);
  } finally {
    w.dispose();
  }
});

test("inline and fragment exports run in an opaque iframe without a server", async ({
  page,
}) => {
  const w = workspace();
  try {
    const entry = w.save(linked());
    for (const mode of ["inline", "fragment"]) {
      const output = w.html(entry, ["--html-mode", mode]);
      const content = readFileSync(output.output, "utf8");
      await page.setContent(
        `<iframe title="Saved visualization" sandbox="allow-scripts" style="width:900px;height:800px"></iframe>`,
      );
      await page
        .getByTitle("Saved visualization")
        .evaluate((iframe, content) => {
          iframe.srcdoc = content;
        }, content);
      const frame = page.frameLocator("iframe");
      await frame.locator("#visualize[data-ready=true]").waitFor();
      await frame
        .getByRole("combobox", { name: "Segment", exact: true })
        .selectOption({ label: "1 (number)" });
      await expect(
        frame.getByRole("region", { name: "Total amount" }),
      ).toContainText("12");
    }
  } finally {
    w.dispose();
  }
});

test("text keeps normal browser paragraph selection", async ({ page }) => {
  const w = workspace();
  try {
    const output = w.html(w.save(linked()));
    await openExport(page, output.output);
    await page
      .getByText("Select this complete sentence with a triple click.", {
        exact: true,
      })
      .click({ clickCount: 3 });
    expect(await page.evaluate(() => getSelection()?.toString())).toContain(
      "Select this complete sentence with a triple click.",
    );
  } finally {
    w.dispose();
  }
});

test("chart zoom fits again without restoring hidden series", async ({
  page,
}) => {
  const w = workspace();
  try {
    const output = w.html(w.save(linked()));
    await openExport(page, output.output);
    const region = page.getByRole("region", { name: "Segment comparison" }),
      chart = region.getByRole("img");
    const heading = page.getByRole("heading", {
      name: linked().title,
      exact: true,
    });
    const before = await chart.screenshot({ animations: "disabled" });
    await region.hover();
    await region.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(
      region.getByRole("button", { name: "Zoom in", exact: true }),
    ).toBeFocused();
    await heading.click();
    await expect(async () => {
      expect(
        (await chart.screenshot({ animations: "disabled" })).equals(before),
      ).toBe(false);
    }).toPass({ timeout: 5000 });
    await region
      .getByRole("button", { name: "Fit chart", exact: true })
      .click();
    await heading.click();
    await expect(async () => {
      expect(
        (await chart.screenshot({ animations: "disabled" })).equals(before),
      ).toBe(true);
    }).toPass({ timeout: 5000 });
    const legend = region.getByRole("button", { name: "amount", exact: true });
    await legend.click();
    await expect(legend).toHaveAttribute("aria-pressed", "false");
    await region.hover();
    await region
      .getByRole("button", { name: "Fit chart", exact: true })
      .click();
    await expect(legend).toHaveAttribute("aria-pressed", "false");
  } finally {
    w.dispose();
  }
});

test("shift clicking the same chart category toggles its linked selection", async ({
  page,
}) => {
  const w = workspace();
  try {
    const output = w.html(w.save(linked()));
    await openExport(page, output.output);
    const bar = page.getByRole("button", {
      name: "amount · 1 (number): 12",
      exact: true,
    });
    await bar.click({ modifiers: ["Shift"] });
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("12");
    await bar.click({ modifiers: ["Shift"] });
    await expect(
      page.getByRole("region", { name: "Total amount" }),
    ).toContainText("114");
  } finally {
    w.dispose();
  }
});
