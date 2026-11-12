// Checks that the plot blocks of built pages became charts, in a real browser.
//
//   node docs/recipes/samples/check.mjs <url-or-dir> [path...]
//
// A directory is served on localhost (index.html for folders). Each path is
// loaded (default "/"), and the page's charts, error displays and console errors
// are counted. Requests for plotdown.js on jsDelivr are answered from
// packages/plotdown/dist, so a sample that uses the published script tag is
// checked against the current build (PLOTDOWN_CDN=1 lets them through to jsDelivr).
// Exit code 1 when a page has no chart. PLOTDOWN_SHOTS=<dir> saves screenshots.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(here, "../../../packages/plotdown");
const {chromium} = createRequire(path.join(packageDir, "package.json"))("playwright");

const [target, ...paths] = process.argv.slice(2);
if (!target) {
  console.error("usage: node check.mjs <url-or-dir> [path...]");
  process.exit(2);
}

const TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json", ".ico": "image/x-icon"};

let server;
let origin = target;
if (!/^https?:\/\//.test(target)) {
  const root = path.resolve(target);
  server = http.createServer((request, response) => {
    let file = path.join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    if (!file.startsWith(root)) return response.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
    if (!fs.existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, {"Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream"});
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
}

const browser = await chromium.launch({channel: process.env.PLOTDOWN_BROWSER ?? "msedge"});
console.log(`browser: ${process.env.PLOTDOWN_BROWSER ?? "msedge"} ${browser.version()}`);
const context = await browser.newContext({viewport: {width: 1000, height: 800}});
if (!process.env.PLOTDOWN_CDN) {
  await context.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\/npm\/@devlooped\/plotdown(@[^/]+)?\/dist\/[^/?#]+/, (route) => {
    const name = path.basename(new URL(route.request().url()).pathname);
    const file = path.join(packageDir, "dist", name);
    if (!fs.existsSync(file)) return route.fulfill({status: 404});
    route.fulfill({status: 200, contentType: "text/javascript", headers: {"Access-Control-Allow-Origin": "*"}, body: fs.readFileSync(file)});
  });
}

let failed = 0;
for (const p of paths.length ? paths : ["/"]) {
  const url = new URL(p, origin.endsWith("/") ? origin : origin + "/").href;
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  try {
    await page.goto(url, {waitUntil: "load"});
    await page.waitForFunction(() => document.querySelectorAll("plotdown-chart, .plotdown svg").length > 0, null, {timeout: 8000}).catch(() => {});
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => ({
      charts: Array.from(document.querySelectorAll("plotdown-chart")).filter((host) => host.shadowRoot?.querySelector("svg")).length,
      // The rehype plugin and the other build-time adapters: <div class="plotdown"> around Plot's svg or figure.
      inline: Array.from(document.querySelectorAll(".plotdown:not(.plotdown-error)")).filter((el) => el.querySelector("svg")).length,
      errors: Array.from(document.querySelectorAll("plotdown-error")).map((host) => (host.shadowRoot?.textContent ?? host.textContent).trim().slice(0, 120)),
      inlineErrors: Array.from(document.querySelectorAll(".plotdown-error .plotdown-message")).map((el) => el.textContent.trim().slice(0, 120)),
      // Blocks that look like a plot spec but nothing claimed: markup plotdown.js misses.
      missed: Array.from(document.querySelectorAll("pre"))
        .filter((pre) => /"marks"\s*:/.test(pre.textContent) && !pre.closest("[data-plotdown], .plotdown"))
        .map((pre) => (pre.parentElement?.outerHTML ?? pre.outerHTML).slice(0, 300))
    }));
    const total = result.charts + result.inline;
    console.log(`${url}\n  charts: ${result.charts}${result.inline ? ` (+${result.inline} inline svg)` : ""}  errors: ${result.errors.length + result.inlineErrors.length}  console errors: ${errors.length}`);
    for (const text of [...result.errors, ...result.inlineErrors]) console.log(`  error display: ${text.replace(/\s+/g, " ")}`);
    for (const text of errors) console.log(`  console: ${text.slice(0, 200)}`);
    for (const html of result.missed) console.log(`  missed: ${html.replace(/\s+/g, " ")}`);
    if (!total) failed++;
    if (process.env.PLOTDOWN_SHOTS) {
      fs.mkdirSync(process.env.PLOTDOWN_SHOTS, {recursive: true});
      await page.screenshot({path: path.join(process.env.PLOTDOWN_SHOTS, `${p.replace(/[^\w]+/g, "-") || "index"}.png`), fullPage: true});
    }
  } catch (error) {
    failed++;
    console.log(`${url}\n  failed: ${error.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
server?.close();
if (failed) {
  console.log(`${failed} page(s) without a chart`);
  process.exit(1);
}
