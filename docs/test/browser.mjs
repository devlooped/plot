// @ts-check
// Checks the built site in a real browser (Playwright driving the installed
// Edge or Chrome, or PLOTDOWN_BROWSER=msedge|chrome), served with the headers
// of vercel.json (its Content-Security-Policy included):
//
//   pnpm --filter plotdown-site build && pnpm --filter plotdown-site test:browser [--shots <dir>]
//
// In light and in dark: the home page, the gallery and the playground draw
// their charts; the playground shows an invalid block's error with its JSON
// path; a shared playground link restores the block; the theme switch
// rethemes the charts; the fixed paths answer; no page requests another
// origin, and no page logs an error.
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {deflateSync} from "node:zlib";
import {chromium} from "playwright";
import {serve} from "../build/serve.mjs";

const shotsAt = process.argv.indexOf("--shots");
const shots = shotsAt > 0 ? path.resolve(process.argv[shotsAt + 1] ?? "shots") : undefined;
if (shots) await mkdir(shots, {recursive: true});

/** @type {string[]} */
const failures = [];
/** @param {boolean} ok @param {string} message */
function check(ok, message) {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
}

async function launch() {
  const preferred = process.env.PLOTDOWN_BROWSER;
  const attempts = preferred ? [{channel: preferred}] : [{channel: "msedge"}, {channel: "chrome"}, {}];
  let last;
  for (const options of attempts) {
    try {
      const browser = await chromium.launch(options);
      return {browser, name: `${options.channel ?? "chromium"} ${browser.version()}`};
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

/** @param {string} text */
const token = (text) => "pako:" + deflateSync(Buffer.from(text, "utf8")).toString("base64url");

const server = await serve(0);
const {browser, name} = await launch();
console.log(`${name}, ${server.url}`);

try {
  // Fixed paths.
  for (const [file, type] of /** @type {const} */ ([
    ["/llms.txt", "text/plain"],
    ["/llms-full.txt", "text/plain"],
    ["/schema/0.1/plot.schema.json", "application/schema+json"],
    ["/schema/plot.schema.json", "application/schema+json"],
    ["/plotdown.js", "text/javascript"],
    ["/examples/waffle.json", "application/json"]
  ])) {
    const response = await fetch(server.url + file);
    check(response.status === 200 && (response.headers.get("content-type") ?? "").startsWith(type), `${file} answers ${response.status} ${response.headers.get("content-type")}`);
    if (file.startsWith("/schema/")) {
      const schema = await response.json();
      // The stable path serves the current version, whose $id names the version.
      check(file === "/schema/plot.schema.json" ? /^https:\/\/plotdown\.cc\/schema\/[\d.]+\/plot\.schema\.json$/.test(schema.$id) : schema.$id === `https://plotdown.cc${file}`, `${file} has the $id of its version`);
    }
  }
  const missing = await fetch(server.url + "/no/such/page/");
  check(missing.status === 404 && (await missing.text()).includes("Nothing here"), "an unknown path answers 404 with the 404 page");

  for (const scheme of /** @type {const} */ (["light", "dark"])) {
    const context = await browser.newContext({colorScheme: scheme, viewport: {width: 1360, height: 900}});
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {origin: server.url});
    /** @type {string[]} */
    const foreign = [];
    /** @type {string[]} */
    const errors = [];
    context.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith(server.url) && !/^(data|blob):/.test(url)) foreign.push(url);
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${page.url()}: ${message.text()}`);
    });

    /**
     * @param {string} url
     * @param {number} charts the number of charts plotdown.js must draw
     */
    async function visit(url, charts) {
      await page.goto(server.url + url);
      await page.waitForFunction((count) => document.querySelectorAll("plotdown-chart").length >= count, charts, {timeout: 20000}).catch(() => undefined);
      const drawn = await page.locator("plotdown-chart").count();
      const failed = await page.locator("plotdown-error").count();
      const theme = await page.evaluate(() => document.documentElement.dataset.theme);
      check(drawn >= charts && failed === 0, `${scheme}: ${url} draws ${drawn} charts (expected ${charts}), ${failed} errors, theme ${theme}`);
      return {drawn, failed};
    }

    await visit("/", 6);
    check((await page.locator(".hero-chart svg").count()) > 0, `${scheme}: the hero chart is in the page`);
    const schemes = await page.$$eval("plotdown-chart", (hosts) => [...new Set(hosts.map((host) => host.getAttribute("data-scheme")))]);
    check(schemes.length === 1 && schemes[0] === scheme, `${scheme}: the charts follow the page (${schemes.join(", ")})`);
    if (shots) await page.screenshot({path: path.join(shots, `home-${scheme}.png`), fullPage: true});
    if (shots) await page.screenshot({path: path.join(shots, `home-top-${scheme}.png`)});

    // The theme switch: the page and the charts change together.
    await page.click("[data-theme-switch]");
    const other = scheme === "light" ? "dark" : "light";
    await page.waitForFunction((want) => [...document.querySelectorAll("plotdown-chart")].every((host) => host.getAttribute("data-scheme") === want), other, {timeout: 5000}).catch(() => undefined);
    const after = await page.$$eval("plotdown-chart", (hosts) => [...new Set(hosts.map((host) => host.getAttribute("data-scheme")))]);
    check(after.length === 1 && after[0] === other, `${scheme}: the theme switch turns the charts ${other} (${after.join(", ")})`);
    await page.click("[data-theme-switch]");
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, scheme);

    await visit("/gallery/", 30);
    if (shots) await page.screenshot({path: path.join(shots, `gallery-${scheme}.png`), fullPage: true});
    await visit("/spec/", 1);
    if (shots) await page.screenshot({path: path.join(shots, `spec-${scheme}.png`)});
    await visit("/recipes/", 0);
    if (shots) await page.screenshot({path: path.join(shots, `recipes-${scheme}.png`), fullPage: true});
    const recipes = await page.$$eval(".recipe-group a[href^='/recipes/']", (links) => links.map((link) => link.getAttribute("href") ?? ""));
    for (const recipe of recipes) {
      await page.goto(server.url + recipe);
      await page.waitForTimeout(150);
      const drawn = await page.locator("plotdown-chart").count();
      const failed = await page.locator("plotdown-error").count();
      const title = await page.locator(".prose h1").first().textContent();
      check(!!title && failed === 0, `${scheme}: ${recipe} "${title}" (${drawn} charts, ${failed} errors)`);
    }
    if (shots && recipes[0]) {
      await page.goto(server.url + recipes[0]);
      await page.screenshot({path: path.join(shots, `recipe-${scheme}.png`)});
    }

    // The playground draws the starter block.
    await visit("/playground/", 1);
    if (shots) await page.screenshot({path: path.join(shots, `playground-${scheme}.png`)});

    // An example by name.
    await page.goto(server.url + "/playground/?example=waffle");
    await page.waitForFunction(() => document.querySelector("[data-block]")?.textContent?.includes("waffle"), undefined, {timeout: 10000}).catch(() => undefined);
    await page.waitForSelector("plotdown-chart", {timeout: 10000}).catch(() => undefined);
    check((await page.locator("plotdown-chart").count()) === 1, `${scheme}: ?example=waffle draws the waffle example`);

    // Typing an invalid block shows the error and its path where the chart was.
    await page.click(".cm-content");
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText('{"marks": [{"mark": "dot", "data": [1, 2, 3], "x": "a", "colour": "red"}]}');
    await page.waitForSelector("[data-error]:not([hidden])", {timeout: 10000}).catch(() => undefined);
    const shownPath = await page.locator("[data-error-path]").textContent();
    const message = await page.locator("[data-error-message]").textContent();
    check(shownPath === "$.marks[0].colour", `${scheme}: an invalid block shows its path in place of the chart: ${shownPath}: ${message}`);
    check((await page.locator("plotdown-chart").count()) === 0, `${scheme}: no chart stays for an invalid block`);
    check((await page.locator(".cm-lintRange-error").count()) > 0, `${scheme}: the editor marks the place of the error`);
    if (shots) await page.screenshot({path: path.join(shots, `playground-error-${scheme}.png`)});

    // A syntax error shows its line and column once the text settles.
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText('{\n  "marks": [\n    {"mark": "dot",, "data": [1]}\n  ]\n}');
    await page.waitForFunction(() => document.querySelector("[data-error-place]")?.textContent?.includes("line 3"), undefined, {timeout: 10000}).catch(() => undefined);
    check(((await page.locator("[data-error-place]").textContent()) ?? "").includes("line 3"), `${scheme}: a JSON syntax error names its line: ${await page.locator("[data-error-message]").textContent()}${await page.locator("[data-error-place]").textContent()}`);

    // Fixing it brings the chart back, and the URL holds the block.
    const fixed = '{"marks": [{"mark": "barY", "data": [{"k": "a", "v": 3}, {"k": "b", "v": 5}], "x": "k", "y": "v", "fill": "k"}]}';
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText(fixed);
    await page.waitForSelector("plotdown-chart", {timeout: 10000}).catch(() => undefined);
    check((await page.locator("plotdown-chart").count()) === 1 && (await page.locator("[data-error]").isHidden()), `${scheme}: a valid block brings the chart back`);
    await page.waitForTimeout(600);
    check(page.url().includes("#pako:"), `${scheme}: the address bar holds the block`);
    await page.click("[data-copy-link]");
    await page.waitForFunction(() => document.querySelector("[data-toast]")?.textContent?.startsWith("Copied a link"), undefined, {timeout: 5000}).catch(() => undefined);
    const shared = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    check(shared.startsWith(`${server.url}/playground/#pako:`), `${scheme}: Copy link copies a link to the block (${shared.length} characters)`);

    // Copy as Markdown.
    await page.click("[data-copy-markdown]");
    // The clipboard of Windows writes CRLF.
    const clip = (await page.evaluate(() => navigator.clipboard.readText()).catch(() => "")).replace(/\r\n/g, "\n");
    const expected = "```plot\n" + fixed + "\n```\n";
    check(clip === expected, `${scheme}: Copy as Markdown copies the fenced block${clip === expected ? "" : `: ${JSON.stringify(clip)}`}`);

    // A shared link restores the block, in a new page.
    const second = await context.newPage();
    second.on("pageerror", (error) => errors.push(`${second.url()}: ${error.message}`));
    await second.goto(shared);
    await second.waitForSelector("plotdown-chart", {timeout: 10000}).catch(() => undefined);
    const restored = await second.locator("[data-block]").textContent();
    check(restored === fixed, `${scheme}: a shared link restores the block and draws it${restored === fixed ? "" : `: ${JSON.stringify(restored)}`}`);
    await second.close();

    // A link made elsewhere (the encoding of the image service).
    await page.goto(`${server.url}/playground/#${token('{"marks": [{"mark": "ruleY", "data": [0]}]}')}`);
    await page.waitForSelector("plotdown-chart", {timeout: 10000}).catch(() => undefined);
    check((await page.locator("[data-block]").textContent())?.includes("ruleY") === true, `${scheme}: a pako: link made outside the browser opens`);

    check(foreign.length === 0, `${scheme}: no request leaves the site${foreign.length ? `: ${[...new Set(foreign)].join(", ")}` : ""}`);
    check(errors.length === 0, `${scheme}: no error in the console${errors.length ? `:\n  ${errors.join("\n  ")}` : ""}`);
    await context.close();
  }

  // A phone: the pages reflow to one column and still draw their charts.
  {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    const page = await context.newPage();
    for (const url of ["/", "/playground/", "/recipes/hugo/"]) {
      await page.goto(server.url + url);
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 1, `phone: ${url} fits the width (${overflow}px wider)`);
      if (shots) await page.screenshot({path: path.join(shots, `phone${url.replace(/\//g, "-")}.png`), fullPage: url !== "/playground/"});
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
