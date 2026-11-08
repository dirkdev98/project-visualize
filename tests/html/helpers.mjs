import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function workspace() {
  const directory = mkdtempSync(join(tmpdir(), "visualize-html-"));
  const store = join(directory, "library");
  function cli(args, input) {
    return JSON.parse(
      execFileSync(
        resolve(process.env.VISUALIZE_TEST_BINARY ?? "dist/bin/visualize"),
        [...args, "--store", store],
        {
          input: input === undefined ? undefined : JSON.stringify(input),
          encoding: "utf8",
          timeout: 30_000,
        },
      ),
    );
  }
  function save(document, width = 1280, theme = "light") {
    return cli(
      [
        "render",
        "--project",
        "renderers",
        "--artifact",
        "fixture",
        "--file",
        "-",
        "--width",
        String(width),
        "--theme",
        theme,
        "--scale",
        "1",
      ],
      document,
    );
  }
  function html(entry, args = []) {
    return cli([
      "export",
      "--project",
      entry.project,
      "--artifact",
      entry.artifact,
      "--version",
      entry.version,
      "--format",
      "html",
      ...args,
    ]);
  }
  return {
    directory,
    store,
    cli,
    save,
    html,
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  };
}
export async function openExport(page, file) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const requests = [];
  page.on("request", (request) => {
    if (/^https?:/i.test(request.url())) requests.push(request.url());
  });
  await page.goto(pathToFileURL(file).href);
  await page.locator("#visualize[data-ready=true]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { errors, requests };
}

export async function comparisons(testInfo, native, browser) {
  const file = testInfo.outputPath("html.png");
  writeFileSync(file, browser);
  await testInfo.attach("native", { path: native, contentType: "image/png" });
  await testInfo.attach("html", { path: file, contentType: "image/png" });
}
