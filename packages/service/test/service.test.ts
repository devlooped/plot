import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import zlib from "node:zlib";
import {canonicalBlock, imageLink} from "@devlooped/plotdown/link";
import {renderSvg} from "@devlooped/plotdown/static";
import {describe, expect, it} from "vitest";
import {createInProcessRenderer} from "../src/in-process.js";
import {createDocument} from "../src/render.js";
import {createService, type ImageRenderer} from "../src/service.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../spec/fixtures");
const fixtures = fs
  .readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({name: f.slice(0, -5), text: fs.readFileSync(path.join(fixturesDir, f), "utf8")}));

const BASE = "https://plotdown.cc";
const RENDERER = "plotdown/test plot/test service/test";
const renderer = createInProcessRenderer();
const handle = createService({renderer, rendererId: RENDERER});

const get = (url: string, init: RequestInit = {}) => handle(new Request(url, init));
const post = (pathname: string, body: string, init: RequestInit = {}) => handle(new Request(`${BASE}${pathname}`, {method: "POST", body, ...init}));
const bytes = async (response: Response) => new Uint8Array(await response.arrayBuffer());
const text = async (response: Response) => new TextDecoder().decode(await bytes(response));

/** The size a PNG says it has. */
function pngSize(png: Uint8Array): {width: number; height: number} {
  expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer, png.byteOffset);
  return {width: view.getUint32(16), height: view.getUint32(20)};
}

const dot = '{"title": "Dots", "marks": [{"mark": "dot", "data": [{"x": 1, "y": 2}, {"x": 2, "y": 3}], "x": "x", "y": "y"}]}';
const remoteData = '{"data": {"d": {"url": "https://example.com/d.csv"}}, "marks": [{"mark": "dot", "data": "d", "x": "a"}]}';
const remoteImage = '{"marks": [{"mark": "image", "data": [{"u": "https://example.com/a.png"}], "src": "u", "x": 0, "y": 0}]}';

describe("the fixtures", () => {
  for (const {name, text: source} of fixtures) {
    it(`${name}: GET and POST give the bytes of the static renderer`, async () => {
      const expected = renderSvg(canonicalBlock(source), {document: createDocument()});
      const viaGet = await get(imageLink(source, {maxLength: 100_000}));
      expect(viaGet.status).toBe(200);
      expect(viaGet.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
      expect(await text(viaGet)).toBe(expected);
      const viaPost = await post("/svg", source.replace(/\r?\n/g, "\r\n"));
      expect(viaPost.status).toBe(200);
      expect(await text(viaPost)).toBe(expected);
      expect(viaPost.headers.get("etag")).toBe(viaGet.headers.get("etag"));
    });
  }
});

describe("PNG", () => {
  it("draws the chart at a scale, in the light theme by default", async () => {
    const one = await get(imageLink(dot, {format: "png"}));
    expect(one.status).toBe(200);
    expect(one.headers.get("content-type")).toBe("image/png");
    const width = Number(one.headers.get("plotdown-width"));
    const size1 = pngSize(await bytes(one));
    expect(size1.width).toBe(width);
    const two = await get(imageLink(dot, {format: "png", scale: 2, theme: "dark"}));
    const size2 = pngSize(await bytes(two));
    expect(size2).toEqual({width: size1.width * 2, height: size1.height * 2});
  });

  it("refuses a PNG past the pixel limit, a scale it does not draw, and the auto theme", async () => {
    const huge = createService({renderer: createInProcessRenderer({maxPngPixels: 100_000}), rendererId: RENDERER});
    const response = await huge(new Request(imageLink(dot, {format: "png", scale: 4}), {headers: {accept: "application/json"}}));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("image-too-large");
    expect((await get(`${imageLink(dot, {format: "png"})}?scale=5`)).status).toBe(400);
    expect((await get(`${imageLink(dot, {format: "png"})}?scale=`)).status).toBe(400);
    expect((await get(`${imageLink(dot, {format: "png"})}?theme=auto`)).status).toBe(400);
    expect((await get(`${imageLink(dot)}?scale=2`)).status).toBe(400);
  });
});

describe("refusals", () => {
  const json = {headers: {accept: "application/json"}};

  it("refuses remote data and remote images with 400 and the JSON path of the problem", async () => {
    for (const [block, where] of [[remoteData, "$.data.d.url"], [remoteImage, "$.marks[0].src"]] as const) {
      const response = await get(imageLink(block), json);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toMatchObject({status: 400, code: "invalid-block"});
      expect(body.error.path.startsWith(where.slice(0, 8))).toBe(true);
      expect(decodeURIComponent(response.headers.get("plotdown-error-path")!)).toBe(body.error.path);
    }
    const posted = await post("/svg", remoteData, json);
    expect(posted.status).toBe(400);
    expect((await posted.json()).error.path).toBe("$.data.d.url");
  });

  it("answers an image that says what is wrong where the chart would be: SVG, or PNG for a PNG link", async () => {
    const svg = await get(imageLink(remoteData));
    expect(svg.status).toBe(400);
    expect(svg.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    const body = await text(svg);
    expect(body).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(body).toContain("$.data.d.url");
    expect(body).toContain("This plot block cannot be drawn");
    expect(svg.headers.get("cache-control")).toBe("public, max-age=3600");
    const png = await get(imageLink(remoteData, {format: "png", scale: 2}));
    expect(png.status).toBe(400);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(pngSize(await bytes(png)).width).toBe(1280);
  });

  it("reports a JSON syntax error with its line and column", async () => {
    const response = await post("/svg", '{\n  "marks" []\n}', json);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({code: "invalid-block", path: "$", line: 2});
  });

  it("refuses what is not an encoded block", async () => {
    for (const data of ["eNqrVkrLz1eyUkpKLFKqBQA", "pako:not*base64", "pako:aGVsbG8", "pako:"]) {
      const response = await get(`${BASE}/svg/${data}`, json);
      expect(response.status, data).toBe(400);
      expect((await response.json()).error.code).toMatch(/invalid-encoding|missing-block|not-found/);
    }
  });

  it("refuses an encoded block past the URL limit, a zip bomb, and a posted block past the size limit", async () => {
    const long = await get(`${BASE}/svg/pako:${"A".repeat(16 * 1024 + 1)}`, json);
    expect(long.status).toBe(414);
    const bomb = `pako:${zlib.deflateSync(Buffer.alloc(8 * 1024 * 1024, 0x20), {level: 9}).toString("base64url")}`;
    expect(bomb.length).toBeLessThan(16 * 1024);
    const exploded = await get(`${BASE}/svg/${bomb}`, json);
    expect(exploded.status).toBe(413);
    expect((await exploded.json()).error.code).toBe("block-too-large");
    const big = await post("/svg", " ".repeat(256 * 1024 + 1), json);
    expect(big.status).toBe(413);
    const declared = await handle(new Request(`${BASE}/png`, {method: "POST", body: "{}", headers: {"content-length": String(10_000_000), accept: "application/json"}}));
    expect(declared.status).toBe(413);
  });

  it("refuses an SVG past the size limit", async () => {
    const small = createService({renderer: createInProcessRenderer({maxSvgBytes: 1000}), rendererId: RENDERER});
    const response = await small(new Request(imageLink(dot), json));
    expect(response.status).toBe(422);
  });

  it("answers 404 and 405 for other paths and methods", async () => {
    expect((await get(`${BASE}/jpg/pako:abc`)).status).toBe(404);
    expect((await get(`${BASE}/svg/pako:abc/more`)).status).toBe(404);
    const getPost = await get(`${BASE}/svg`);
    expect(getPost.status).toBe(405);
    expect(getPost.headers.get("allow")).toBe("POST, OPTIONS");
    const postGet = await handle(new Request(imageLink(dot), {method: "POST", body: dot}));
    expect(postGet.status).toBe(405);
    expect(postGet.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect((await handle(new Request(`${BASE}/svg`, {method: "PUT", body: dot}))).status).toBe(405);
  });
});

describe("headers", () => {
  it("lets an image be kept for good by every cache, and Vercel's CDN keep it a year", async () => {
    const response = await get(imageLink(dot));
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("max-age=31536000");
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(response.headers.get("plotdown-renderer")).toBe(RENDERER);
    expect((await post("/svg", dot)).headers.get("cache-control")).toBe("no-store");
  });

  it("keeps a served SVG from running script or reaching the site's origin", async () => {
    const response = await get(imageLink(dot));
    const csp = response.headers.get("content-security-policy")!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("sandbox");
    expect(csp).not.toMatch(/script-src|allow-scripts|allow-same-origin/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });

  it("allows any page to fetch images, and answers preflights", async () => {
    expect((await get(imageLink(dot))).headers.get("access-control-allow-origin")).toBe("*");
    const preflight = await handle(new Request(`${BASE}/png`, {method: "OPTIONS", headers: {origin: "https://example.com", "access-control-request-method": "POST"}}));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Content-Type");
  });

  it("answers HEAD with the headers of GET and no body", async () => {
    const full = await get(imageLink(dot));
    const head = await handle(new Request(imageLink(dot), {method: "HEAD"}));
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(full.headers.get("content-length"));
    expect(head.headers.get("etag")).toBe(full.headers.get("etag"));
    expect((await head.arrayBuffer()).byteLength).toBe(0);
  });

  it("answers 304 to a request that has the image, without drawing it", async () => {
    let renders = 0;
    const counting: ImageRenderer = {render: (job) => (renders++, renderer.render(job)), rasterize: renderer.rasterize};
    const service = createService({renderer: counting, rendererId: RENDERER});
    const first = await service(new Request(imageLink(dot)));
    const again = await service(new Request(imageLink(dot), {headers: {"if-none-match": first.headers.get("etag")!}}));
    expect(again.status).toBe(304);
    expect(renders).toBe(1);
    const other = createService({renderer: counting, rendererId: "another renderer"});
    expect((await other(new Request(imageLink(dot), {headers: {"if-none-match": first.headers.get("etag")!}}))).status).toBe(200);
  });

  it("tells its health", async () => {
    const response = await get(`${BASE}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({status: "ok", renderer: RENDERER});
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("rate limiting", () => {
  it("asks before each render, and answers 429 when the limit says so", async () => {
    const asked: string[] = [];
    const service = createService({
      renderer,
      rendererId: RENDERER,
      rateLimit: async (request) => (asked.push(new URL(request.url).pathname), asked.length > 1)
    });
    expect((await service(new Request(imageLink(dot)))).status).toBe(200);
    const limited = await service(new Request(imageLink(dot, {format: "png"}), {headers: {accept: "application/json"}}));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect((await service(new Request(`${BASE}/api/health`))).status).toBe(200);
    expect(asked).toHaveLength(2);
  });
});
