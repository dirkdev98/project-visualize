import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const binary = resolve(
  process.env.VISUALIZE_TEST_BINARY ?? "dist/bin/visualize",
);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const updated = Buffer.concat([png, Buffer.from("new fictional image")]);
const digest = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

async function fixture(t, handler) {
  const root = mkdtempSync(join(tmpdir(), "visualize-images-"));
  const store = join(root, "library");
  const requests = [];
  const trace = [];
  const server = createServer((request, response) => {
    requests.push(request.headers);
    trace.push({
      event: "request",
      time: Date.now(),
      method: request.method,
      url: request.url,
      headers: request.headers,
    });
    handler(request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    rmSync(root, { recursive: true, force: true });
  });
  const file = join(root, "document.json");
  writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      type: "document",
      title: "Fictional image notes",
      assets: {
        station: `http://127.0.0.1:${server.address().port}/image?variant=one`,
      },
      body: [
        { type: "image", asset: "station" },
        { type: "markdown", content: "![Station](asset:station)" },
      ],
    }),
  );
  async function run(args) {
    trace.push({
      event: "start",
      command: args[0],
      time: Date.now(),
      requests: requests.length,
    });
    const result = await exec(binary, [...args, "--store", store], {
      timeout: 60_000,
    });
    const cache = join(store, "cache", "images");
    trace.push({
      event: "complete",
      command: args[0],
      time: Date.now(),
      requests: requests.length,
      metadata: existsSync(cache)
        ? readdirSync(cache)
            .filter((name) => name.endsWith(".json"))
            .map((name) => JSON.parse(readFileSync(join(cache, name), "utf8")))
        : [],
    });
    return JSON.parse(result.stdout);
  }
  const render = () =>
    run([
      "render",
      "--project",
      "orbital",
      "--artifact",
      "images",
      "--file",
      file,
    ]);
  const asset = (entry) =>
    join(
      entry.directory,
      JSON.parse(readFileSync(entry.document, "utf8")).assets.station,
    );
  return {
    root,
    store,
    requests,
    server,
    run,
    render,
    asset,
    diagnostics: () => JSON.stringify(trace),
  };
}

test("remote images reuse a fresh cache and rerender saved bytes offline", async (t) => {
  const f = await fixture(t, (_request, response) => {
    response.writeHead(200, { "Cache-Control": "max-age=3600" });
    response.end(png);
  });
  const first = await f.render();
  const second = await f.render();
  assert.equal(f.requests.length, 1, f.diagnostics());
  assert.deepEqual(readFileSync(f.asset(first)), png);
  assert.deepEqual(readFileSync(f.asset(second)), png);
  await new Promise((resolve) => f.server.close(resolve));
  await f.run([
    "export",
    "--project",
    "orbital",
    "--artifact",
    "images",
    "--version",
    first.version,
    "--width",
    "640",
    "--format",
    "png",
    "--out",
    join(f.root, "offline.png"),
  ]);
  assert.ok(readFileSync(join(f.root, "offline.png")).length > 8);
});

test("stale images refresh for future revisions while saved evidence stays unchanged", async (t) => {
  let version = 1;
  const f = await fixture(t, (_request, response) => {
    response.writeHead(200, {
      ETag: `"${version}"`,
      "Cache-Control": "max-age=0",
    });
    response.end(version === 1 ? png : updated);
  });
  const first = await f.render();
  const files = [first.document, first.png, first.pdf, f.asset(first)];
  const before = files.map(digest);
  version = 2;
  const stale = await f.render();
  const refreshed = await f.render();
  assert.deepEqual(readFileSync(f.asset(stale)), png);
  assert.deepEqual(readFileSync(f.asset(refreshed)), updated);
  assert.equal(f.requests[1]["if-none-match"], '"1"');
  assert.deepEqual(files.map(digest), before);
});

test("conditional image revalidation accepts 304 and renews freshness", async (t) => {
  const f = await fixture(t, (request, response) => {
    if (request.headers["if-none-match"] === '"source-one"') {
      response.writeHead(304, { "Cache-Control": "max-age=3600" });
      response.end();
    } else {
      response.writeHead(200, {
        ETag: '"source-one"',
        "Cache-Control": "max-age=0",
      });
      response.end(png);
    }
  });
  await f.render();
  await f.render();
  const entry = await f.render();
  assert.equal(f.requests.length, 2, f.diagnostics());
  assert.deepEqual(readFileSync(f.asset(entry)), png);
});

test("failed stale revalidation keeps the cached image available", async (t) => {
  let fail = false;
  const f = await fixture(t, (_request, response) => {
    response.writeHead(fail ? 503 : 200, { "Cache-Control": "max-age=0" });
    response.end(fail ? "unavailable" : png);
  });
  await f.render();
  fail = true;
  const entry = await f.render();
  assert.deepEqual(readFileSync(f.asset(entry)), png);
});

test("required image validation uses Last-Modified before choosing revision bytes", async (t) => {
  let version = 1;
  const dates = [
    "Fri, 06 Nov 2026 12:00:00 GMT",
    "Sat, 07 Nov 2026 12:00:00 GMT",
  ];
  const f = await fixture(t, (_request, response) => {
    response.writeHead(200, {
      "Cache-Control": "no-cache, max-age=3600",
      "Last-Modified": dates[version - 1],
    });
    response.end(version === 1 ? png : updated);
  });
  await f.render();
  version = 2;
  const entry = await f.render();
  assert.deepEqual(readFileSync(f.asset(entry)), updated);
  assert.equal(f.requests[1]["if-modified-since"], dates[0]);
});

test("no-store image responses are copied into revisions without cache retention", async (t) => {
  const f = await fixture(t, (_request, response) => {
    response.writeHead(200, { "Cache-Control": "no-store" });
    response.end(png);
  });
  await f.render();
  const entry = await f.render();
  assert.equal(f.requests.length, 2, f.diagnostics());
  assert.deepEqual(readFileSync(f.asset(entry)), png);
  assert.deepEqual(readdirSync(join(f.store, "cache", "images")), []);
});

test("invalid cold remote images publish no partial revision", async (t) => {
  const f = await fixture(t, (_request, response) =>
    response.end("a page instead of an image"),
  );
  await assert.rejects(f.render(), /PNG or JPEG/);
  assert.deepEqual(
    readdirSync(join(f.store, "projects", "orbital", "images")),
    [],
  );
});

test("oversized remote images fail before publishing a revision", async (t) => {
  const f = await fixture(t, (_request, response) => {
    response.writeHead(200, { "Content-Length": 21 * 1024 * 1024 });
    response.end(png);
  });
  await assert.rejects(f.render(), /20 MiB/);
  assert.deepEqual(
    readdirSync(join(f.store, "projects", "orbital", "images")),
    [],
  );
});

test("chunked remote images enforce the byte limit without Content-Length", async (t) => {
  const f = await fixture(t, (_request, response) => {
    response.writeHead(200);
    response.end(Buffer.alloc(21 * 1024 * 1024));
  });
  await assert.rejects(f.render(), /20 MiB/);
  assert.deepEqual(
    readdirSync(join(f.store, "projects", "orbital", "images")),
    [],
  );
});

test("concurrent image renders retain independent complete revisions", async (t) => {
  const f = await fixture(t, (_request, response) => {
    response.writeHead(200, { "Cache-Control": "max-age=3600" });
    response.end(png);
  });
  const entries = await Promise.all([f.render(), f.render()]);
  assert.notEqual(entries[0].version, entries[1].version);
  for (const entry of entries)
    assert.deepEqual(readFileSync(f.asset(entry)), png);
  const requests = f.requests.length;
  await f.render();
  assert.equal(f.requests.length, requests);
});
