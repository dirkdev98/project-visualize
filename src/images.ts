import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { type IncomingHttpHeaders, request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { join } from "node:path";

const maximumBytes = 20 * 1024 * 1024;
interface CachedImage {
  blob: string;
  expires: number;
  etag?: string;
  modified?: string;
  revalidate: boolean;
  directives: string;
}
interface Download {
  status: number;
  headers: IncomingHttpHeaders;
  bytes: Buffer;
}

function extension(bytes: Buffer) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return ".png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ".jpg";
  throw new Error("Remote images must contain PNG or JPEG data");
}
function atomicWrite(file: string, bytes: string | Buffer) {
  const pending = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(pending, bytes);
    renameSync(pending, file);
  } finally {
    rmSync(pending, { force: true });
  }
}
async function download(
  url: string,
  headers: Record<string, string>,
  redirects = 0,
): Promise<Download> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("Image URLs must use HTTP or HTTPS");
  if (parsed.username || parsed.password)
    throw new Error("Image URLs cannot contain credentials");
  const result = await new Promise<Download>((resolve, reject) => {
    const request = (parsed.protocol === "https:" ? requestHttps : requestHttp)(
      parsed,
      { headers },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status !== 200) {
          response.resume();
          resolve({
            status,
            headers: response.headers,
            bytes: Buffer.alloc(0),
          });
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        if (Number(response.headers["content-length"]) > maximumBytes) {
          response.destroy(new Error("Remote image exceeds 20 MiB"));
        }
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maximumBytes)
            response.destroy(new Error("Remote image exceeds 20 MiB"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            status,
            headers: response.headers,
            bytes: Buffer.concat(chunks),
          }),
        );
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error("Image request timed out")),
      15_000,
    );
    request.on("error", reject);
    request.on("close", () => clearTimeout(timer));
    request.end();
  });
  if (
    [301, 302, 303, 307, 308].includes(result.status) &&
    result.headers.location
  ) {
    if (redirects >= 5) throw new Error("Too many image redirects");
    return download(
      new URL(result.headers.location, url).href,
      headers,
      redirects + 1,
    );
  }
  return result;
}

/** Remote caching serves creation; saved versions always own their chosen image bytes. */
export class ImageCache {
  private directory: string;
  private pending = new Map<string, Promise<string>>();
  private selected = new Map<string, Promise<string>>();
  private temporary: string[] = [];
  constructor(root: string) {
    this.directory = join(root, "cache", "images");
    mkdirSync(this.directory, { recursive: true });
  }
  resolve(url: string): Promise<string> {
    let selected = this.selected.get(url);
    if (!selected) {
      selected = this.choose(url);
      this.selected.set(url, selected);
    }
    return selected;
  }
  private async choose(url: string): Promise<string> {
    const key = createHash("sha256").update(url).digest("hex");
    const metadata = join(this.directory, `${key}.json`);
    let cached: CachedImage | undefined;
    try {
      const candidate: CachedImage = JSON.parse(readFileSync(metadata, "utf8"));
      if (
        /^[a-f0-9]{64}\.(png|jpg)$/.test(candidate.blob) &&
        existsSync(join(this.directory, candidate.blob))
      )
        cached = candidate;
    } catch {
      /* Missing or incomplete cache entries are cold requests. */
    }
    const file = cached ? join(this.directory, cached.blob) : undefined;
    if (cached && file && cached.expires > Date.now()) return file;
    let refresh = this.pending.get(key);
    if (!refresh) {
      refresh = this.refresh(url, metadata, cached);
      this.pending.set(key, refresh);
      // Attach the handler immediately: stale refresh failures must never reject the render.
      void refresh.catch(() => {});
    }
    if (cached && file && !cached.revalidate) return file;
    return refresh;
  }
  async settle() {
    await Promise.allSettled(this.pending.values());
    for (const file of this.temporary) rmSync(file, { force: true });
  }
  private async refresh(
    url: string,
    metadata: string,
    cached?: CachedImage,
  ): Promise<string> {
    const headers: Record<string, string> = { Accept: "image/png, image/jpeg" };
    if (cached?.etag) headers["If-None-Match"] = cached.etag;
    if (cached?.modified) headers["If-Modified-Since"] = cached.modified;
    const response = await download(url, headers);
    if (response.status !== 200 && !(response.status === 304 && cached))
      throw new Error(`Image request failed: HTTP ${response.status}`);
    const directives =
      response.headers["cache-control"] ??
      (response.status === 304 ? cached?.directives : undefined) ??
      "";
    if (/(?:^|,)\s*no-store\b/i.test(directives)) {
      rmSync(metadata, { force: true });
      if (response.status === 304 && cached)
        return join(this.directory, cached.blob);
      const file = join(
        this.directory,
        `${randomUUID()}${extension(response.bytes)}`,
      );
      this.temporary.push(file);
      writeFileSync(file, response.bytes);
      return file;
    }
    const lifetime = Number(
      /(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(directives)?.[1] ?? 3600,
    );
    const age = Number(response.headers.age ?? 0);
    const blob =
      response.status === 304 && cached
        ? cached.blob
        : `${createHash("sha256").update(response.bytes).digest("hex")}${extension(response.bytes)}`;
    const file = join(this.directory, blob);
    if (response.status === 200) atomicWrite(file, response.bytes);
    const entry: CachedImage = {
      blob,
      expires: Date.now() + Math.max(0, Math.min(lifetime - age, 86400)) * 1000,
      etag:
        response.headers.etag ??
        (response.status === 304 ? cached?.etag : undefined),
      modified:
        response.headers["last-modified"] ??
        (response.status === 304 ? cached?.modified : undefined),
      revalidate: /(?:^|,)\s*(?:no-cache|must-revalidate)\b/i.test(directives),
      directives,
    };
    if (/(?:^|,)\s*no-cache\b/i.test(directives)) entry.expires = 0;
    atomicWrite(metadata, JSON.stringify(entry));
    return file;
  }
}
