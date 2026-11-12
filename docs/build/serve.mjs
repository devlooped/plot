// @ts-check
// Serves the built site on http://localhost:4173 (or $PORT), as Vercel would:
// /dir/ → /dir/index.html, unknown paths → /404.html with status 404, and the
// headers of vercel.json that apply to every path.
//
//   pnpm --filter plotdown-site serve
import {createServer} from "node:http";
import {existsSync, readFileSync, statSync} from "node:fs";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const docs = fileURLToPath(new URL("..", import.meta.url));
const dist = path.resolve(docs, process.env.PLOTDOWN_SITE_OUT ?? "dist");
const port = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

/** The headers of vercel.json, by source pattern. */
const config = JSON.parse(readFileSync(path.join(docs, "vercel.json"), "utf8"));
/** @type {{pattern: RegExp, headers: {key: string, value: string}[]}[]} */
const rules = (config.headers ?? []).map((/** @type {{source: string, headers: {key: string, value: string}[]}} */ rule) => ({
  // Only the forms vercel.json uses here: literal paths and (.*).
  pattern: new RegExp("^" + rule.source.split("(.*)").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$"),
  headers: rule.headers
}));

/** @param {string} pathname */
function resolve(pathname) {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const file = path.join(dist, clean);
  if (!file.startsWith(dist)) return undefined;
  if (existsSync(file) && statSync(file).isFile()) return file;
  if (existsSync(path.join(file, "index.html"))) return path.join(file, "index.html");
  return undefined;
}

/**
 * Starts the server; resolves with its address once it listens.
 * @param {number} [listenPort]
 * @returns {Promise<{url: string, close: () => Promise<void>}>}
 */
export function serve(listenPort = port) {
  const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  let file = resolve(url.pathname);
  // Vercel with trailingSlash: true redirects /dir to /dir/.
  if (file && file.endsWith("index.html") && !url.pathname.endsWith("/")) {
    response.writeHead(308, {location: url.pathname + "/" + url.search});
    response.end();
    return;
  }
  const status = file ? 200 : 404;
  file ??= path.join(dist, "404.html");
  response.setHeader("content-type", /** @type {Record<string, string>} */ (TYPES)[path.extname(file)] ?? "application/octet-stream");
  for (const rule of rules) if (rule.pattern.test(url.pathname)) for (const header of rule.headers) response.setHeader(header.key, header.value);
  response.writeHead(status);
  response.end(await readFile(file));
  });
  return new Promise((resolve) =>
    server.listen(listenPort, "127.0.0.1", () => {
      const address = server.address();
      const actual = typeof address === "object" && address ? address.port : listenPort;
      resolve({url: `http://127.0.0.1:${actual}`, close: () => new Promise((done) => server.close(() => done()))});
    })
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {url} = await serve();
  console.log(`plotdown-site: ${url}/ (${path.relative(process.cwd(), dist) || "."})`);
}
