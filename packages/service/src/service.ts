// The image service as a function from a Request to a Response (the Fetch API
// of Node, browsers, Vercel and workers). It routes, decodes, checks the limits,
// asks a renderer for the bytes, and writes the headers; the renderer runs the
// chart elsewhere (a worker thread on Vercel, see pool.ts).
//
//   GET|HEAD /svg/pako:<data>[?theme=auto|light|dark]           image/svg+xml
//   GET|HEAD /png/pako:<data>[?theme=light|dark][&scale=1|2|3|4] image/png
//   POST     /svg, /png (body: the block, same query)            the same, not cached
//   GET|HEAD /api/health                                         application/json
//   OPTIONS  any of them                                         CORS preflight
import {
  ImageOptionsError,
  InflateError,
  canonicalBlock,
  decodeBlock,
  normalizeImageOptions,
  type ImageOptions,
  type ImageTheme
} from "@devlooped/plotdown/link";
import {errorSvg} from "./errors.js";
import {DEFAULT_SERVICE_LIMITS, type ServiceLimits} from "./limits.js";
import type {ImageFormat, RenderJob, RenderOutcome, ServiceErrorInfo} from "./render.js";

/** Draws images; the service never draws itself. */
export interface ImageRenderer {
  /** Renders a job; a problem of the block comes back as an outcome, not a rejection. */
  render(job: RenderJob): Promise<RenderOutcome>;
  /** Draws a small trusted SVG (an error image) as a PNG. */
  rasterize(svg: string, scale: number): Promise<Uint8Array>;
}

export interface ServiceOptions {
  renderer: ImageRenderer;
  /** Names the renderer's versions, such as "plotdown/0.1.0 plot/0.6.19 service/0.1.0": part of each ETag, and told by the health path. */
  rendererId: string;
  /** The limits of the requests (encoded and posted sizes); those of a render (time, SVG bytes, PNG pixels) are the renderer's. */
  limits?: Partial<ServiceLimits>;
  /** Called before each render (never for an answer that needs none); resolves true to refuse the request with 429. */
  rateLimit?: (request: Request) => Promise<boolean>;
}

export type Handler = (request: Request) => Promise<Response>;

/** One year: the longest a cache keeps anything, and the time an image lives at Vercel's CDN and downstream. */
const YEAR = 31_536_000;
const SVG_TYPE = "image/svg+xml; charset=utf-8";
const PNG_TYPE = "image/png";
const JSON_TYPE = "application/json; charset=utf-8";

/**
 * Headers of every answer. An SVG opened by itself is a document of the site's
 * origin: the sandbox gives it an opaque origin and no script, and the policy
 * lets it load nothing but its inline style and its data: images.
 */
function baseHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "ETag, Plotdown-Renderer, Plotdown-Width, Plotdown-Height, Plotdown-Error-Code, Plotdown-Error-Path",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
}

class RequestError extends Error {
  constructor(readonly info: ServiceErrorInfo) {
    super(info.message);
  }
}

const refuse = (status: number, code: string, message: string): never => {
  throw new RequestError({status, code, message});
};

/** Whether the client asks for JSON rather than an image (browsers' <img> never do). */
function wantsJson(request: Request): boolean {
  return /\bapplication\/json\b/i.test(request.headers.get("accept") ?? "");
}

function parseOptions(format: ImageFormat, query: URLSearchParams): Required<ImageOptions> {
  const theme = query.get("theme");
  const scale = query.get("scale");
  let options: ImageOptions;
  try {
    options = normalizeImageOptions(format, {
      theme: theme === null ? undefined : (theme as ImageTheme),
      scale: scale === null ? undefined : scale.trim() === "" ? Number.NaN : Number(scale)
    });
  } catch (error) {
    if (error instanceof ImageOptionsError) return refuse(400, "invalid-option", error.message);
    throw error;
  }
  return {theme: options.theme ?? (format === "png" ? "light" : "auto"), scale: options.scale ?? 1};
}

/** Reads a POST body as UTF-8 text, refusing it as soon as it passes the limit. */
async function readBody(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) refuse(413, "block-too-large", `the block is ${declared} bytes, over the limit of ${limit}`);
  if (!request.body) refuse(400, "missing-block", "send the text of the plot block as the body of the request");
  const reader = request.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      refuse(413, "block-too-large", `the block is over the limit of ${limit} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  } catch {
    return refuse(400, "invalid-encoding", "the body is not UTF-8 text");
  }
}

function decodePath(data: string, limits: ServiceLimits): string {
  if (data.length > limits.maxEncodedLength) refuse(414, "uri-too-long", `the encoded block is ${data.length} characters, over the limit of ${limits.maxEncodedLength}: POST the block instead`);
  let encoded: string;
  try {
    encoded = decodeURIComponent(data);
  } catch {
    return refuse(400, "invalid-encoding", "the path is not a valid URL path");
  }
  if (!encoded.startsWith("pako:")) refuse(400, "invalid-encoding", 'the block must be encoded as "pako:" followed by its zlib-compressed text in base64url');
  try {
    return decodeBlock(encoded, {maxBytes: limits.maxBlockBytes});
  } catch (error) {
    if (error instanceof InflateError) {
      if (error.reason === "too-large") refuse(413, "block-too-large", `the block is over the limit of ${limits.maxBlockBytes} bytes once decoded`);
      refuse(400, "invalid-encoding", `the block cannot be decoded: ${error.message}`);
    }
    throw error;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function json(status: number, value: unknown, headers = baseHeaders()): Response {
  headers.set("Content-Type", JSON_TYPE);
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(value), {status, headers});
}

/** Creates the request handler. */
export function createService(options: ServiceOptions): Handler {
  const limits: ServiceLimits = {...DEFAULT_SERVICE_LIMITS, ...options.limits};
  const {renderer, rendererId} = options;

  async function errorResponse(request: Request, error: ServiceErrorInfo, format: ImageFormat | undefined, theme: ImageTheme, scale: number): Promise<Response> {
    const headers = baseHeaders();
    headers.set("Plotdown-Renderer", rendererId);
    headers.set("Plotdown-Error-Code", error.code);
    if (error.path) headers.set("Plotdown-Error-Path", encodeURIComponent(error.path));
    // An invalid block stays invalid for this renderer: browsers and image proxies may keep the answer an hour.
    // Vercel's CDN does not cache a 4xx (but 404 and 410), so a fixed renderer is seen at once on the site.
    const cacheControl = error.code === "invalid-block" && request.method !== "POST" ? "public, max-age=3600" : "no-store";
    if (error.status === 429) headers.set("Retry-After", "60");
    if (error.status === 503) headers.set("Retry-After", "5");
    if (!format || wantsJson(request)) {
      const response = json(error.status, {error}, headers);
      response.headers.set("Cache-Control", cacheControl);
      return request.method === "HEAD" ? new Response(null, {status: response.status, headers: response.headers}) : response;
    }
    headers.set("Cache-Control", cacheControl);
    const svg = errorSvg(error, format === "png" ? (theme === "dark" ? "dark" : "light") : theme);
    let body: Uint8Array;
    if (format === "png") {
      headers.set("Content-Type", PNG_TYPE);
      body = await renderer.rasterize(svg, scale);
    } else {
      headers.set("Content-Type", SVG_TYPE);
      body = new TextEncoder().encode(svg);
    }
    headers.set("Content-Length", String(body.length));
    return new Response(request.method === "HEAD" ? null : (body as BodyInit), {status: error.status, headers});
  }

  async function image(request: Request, format: ImageFormat, data: string | undefined, query: URLSearchParams): Promise<Response> {
    let theme: ImageTheme = format === "png" ? "light" : "auto";
    let scale = 1;
    try {
      ({theme, scale} = parseOptions(format, query));
      // The text as links carry it (no BOM, LF line endings, no outer whitespace): a POST and the link of
      // the same block give the same bytes, and those that plotdown render writes for it in Markdown.
      const text = canonicalBlock(data === undefined ? await readBody(request, limits.maxBlockBytes) : decodePath(data, limits));
      if (!text) refuse(400, "missing-block", "the block is empty");

      // Same renderer, same block, same options: same bytes. The ETag says so before anything is drawn.
      const etag = `"${(await sha256Hex(`${rendererId}\n${format}\n${theme}\n${scale}\n${text}`)).slice(0, 32)}"`;
      const cached = request.method !== "POST" && etagMatches(request.headers.get("if-none-match"), etag);
      const headers = baseHeaders();
      headers.set("ETag", etag);
      headers.set("Plotdown-Renderer", rendererId);
      if (request.method === "POST") {
        headers.set("Cache-Control", "no-store");
      } else {
        // Browsers, image proxies (GitHub's camo) and other CDNs keep the image for good: the URL holds the
        // whole chart. Vercel's CDN keeps it too, per deployment, so a new release draws every image anew there.
        headers.set("Cache-Control", `public, max-age=${YEAR}, immutable`);
        headers.set("Vercel-CDN-Cache-Control", `max-age=${YEAR}`);
      }
      if (cached) return new Response(null, {status: 304, headers});

      if (options.rateLimit && (await options.rateLimit(request))) {
        refuse(429, "rate-limited", "too many charts drawn from this address: try again in a minute");
      }
      const outcome = await renderer.render({format, text, theme, scale});
      if (!outcome.ok) return errorResponse(request, outcome.error, format, theme, scale);
      headers.set("Content-Type", format === "svg" ? SVG_TYPE : PNG_TYPE);
      headers.set("Content-Length", String(outcome.body.length));
      headers.set("Plotdown-Width", String(outcome.width));
      headers.set("Plotdown-Height", String(outcome.height));
      return new Response(request.method === "HEAD" ? null : (outcome.body as BodyInit), {status: 200, headers});
    } catch (error) {
      if (error instanceof RequestError) return errorResponse(request, error.info, format, theme, scale);
      throw error;
    }
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    try {
      if (method === "OPTIONS") {
        const headers = baseHeaders();
        headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type, Accept, If-None-Match");
        headers.set("Access-Control-Max-Age", "86400");
        headers.set("Cache-Control", "public, max-age=86400");
        return new Response(null, {status: 204, headers});
      }
      if (url.pathname === "/api/health") {
        if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD, OPTIONS");
        const response = json(200, {status: "ok", renderer: rendererId});
        return method === "HEAD" ? new Response(null, {status: 200, headers: response.headers}) : response;
      }
      const match = /^\/(svg|png)(?:\/([^/]+))?\/?$/.exec(url.pathname);
      if (!match) return json(404, {error: {status: 404, code: "not-found", message: "use /svg/pako:…, /png/pako:… or POST /svg, /png"}});
      const format = match[1] as ImageFormat;
      const data = match[2];
      if (data !== undefined && method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD, OPTIONS");
      if (data === undefined && method !== "POST") return methodNotAllowed("POST, OPTIONS");
      return await image(request, format, data, url.searchParams);
    } catch (error) {
      console.error(error);
      return json(500, {error: {status: 500, code: "internal", message: "the service failed to draw this chart"}});
    }
  };
}

function methodNotAllowed(allow: string): Response {
  const response = json(405, {error: {status: 405, code: "method-not-allowed", message: `use ${allow}`}});
  response.headers.set("Allow", allow);
  return response;
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const t = tag.trim();
    return t === "*" || t === etag || t === `W/${etag}`;
  });
}
