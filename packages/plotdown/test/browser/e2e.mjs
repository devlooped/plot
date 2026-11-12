// plotdown.js in a real browser, under a strict Content-Security-Policy.
// Run after `pnpm build`: `pnpm test:browser`. It uses Playwright's Chromium,
// or else the Edge or Chrome installed on the machine (PLOTDOWN_BROWSER=msedge
// or chrome picks one). Screenshots go to test/browser/results (ignored by git).
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import zlib from "node:zlib";
import {chromium} from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(here, "../..");
const samplesDir = path.join(here, "samples");
const resultsDir = path.join(here, "results");
fs.mkdirSync(resultsDir, {recursive: true});

// No inline script, no inline style, nothing from elsewhere.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:";

const DARK_CSS = "body { background-color: #0d1117; color: #e6edf3; font-family: system-ui, sans-serif; }";

function pageFor(url) {
  const sample = url.pathname.replace(/^\/sample\//, "");
  const body = sample === "empty" ? "<main></main>" : fs.readFileSync(path.join(samplesDir, path.basename(sample)), "utf8");
  const kind = url.searchParams.get("script") ?? "module";
  const attributes = url.searchParams.get("attrs") ?? "";
  const script =
    kind === "classic"
      ? `<script src="/dist/plotdown.iife.js" ${attributes}></script>`
      : `<script type="module" src="/dist/plotdown.js" ${attributes}></script>`;
  const css = url.searchParams.get("dark") ? `<link rel="stylesheet" href="/dark.css">` : "";
  // A classic script in <head> runs before the body exists; a module script waits.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${sample}</title>${css}${script}</head><body>${body}</body></html>`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  // Pages copied from a site keep their style="" attributes: ?attrstyle=1 allows those, and only those.
  const csp = url.searchParams.get("attrstyle") ? `${CSP}; style-src-attr 'unsafe-inline'` : CSP;
  const headers = {"Content-Security-Policy": csp, "Cache-Control": "no-store"};
  try {
    if (url.pathname.startsWith("/dist/")) {
      const file = path.join(packageDir, "dist", path.basename(url.pathname));
      response.writeHead(200, {...headers, "Content-Type": file.endsWith(".map") ? "application/json" : "text/javascript"});
      response.end(fs.readFileSync(file));
    } else if (url.pathname === "/dark.css") {
      response.writeHead(200, {...headers, "Content-Type": "text/css"});
      response.end(DARK_CSS);
    } else if (url.pathname.startsWith("/sample/")) {
      response.writeHead(200, {...headers, "Content-Type": "text/html; charset=utf-8"});
      response.end(pageFor(url));
    } else if (url.pathname === "/favicon.ico") {
      response.writeHead(204, headers).end();
    } else {
      response.writeHead(404, headers).end();
    }
  } catch {
    response.writeHead(404, headers).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

async function launch() {
  const preferred = process.env.PLOTDOWN_BROWSER;
  const attempts = preferred ? [{channel: preferred}] : [{}, {channel: "msedge"}, {channel: "chrome"}];
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

const {browser, name} = await launch();
console.log(`browser: ${name}`);
const context = await browser.newContext({viewport: {width: 900, height: 700}});
// Collects CSP violations and page errors in every page (init scripts are not subject to the page's CSP).
await context.addInitScript(() => {
  window.__violations = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
});

let failures = 0;
async function test(title, fn) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  try {
    await fn(page);
    assert.deepEqual(errors, [], "errors in the page");
    assert.deepEqual(await page.evaluate(() => window.__violations), [], "CSP violations");
    console.log(`ok - ${title}`);
  } catch (error) {
    failures++;
    console.log(`not ok - ${title}\n  ${String(error?.stack ?? error).split("\n").join("\n  ")}`);
  } finally {
    await page.screenshot({path: path.join(resultsDir, `${title.replace(/[^\w]+/g, "-").replace(/-$/, "")}.png`), fullPage: true}).catch(() => {});
    await page.close();
  }
}

/** What the page shows: charts (with what their shadow root holds), errors, and the state of each block. */
const inspect = (page) =>
  page.evaluate(() => ({
    charts: Array.from(document.querySelectorAll("plotdown-chart")).map((host) => {
      const svg = host.shadowRoot.querySelector(".chart svg");
      const style = svg && getComputedStyle(svg);
      return {
        svg: !!svg,
        marks: svg ? svg.querySelectorAll("rect, circle, path, line").length : 0,
        maxWidth: style?.maxWidth,
        plotBackground: style?.getPropertyValue("--plot-background").trim(),
        styleElements: host.shadowRoot.querySelectorAll("style").length,
        scheme: host.getAttribute("data-scheme"),
        hiddenBlock: getComputedStyle(host.nextElementSibling).display === "none"
      };
    }),
    errors: Array.from(document.querySelectorAll("plotdown-error")).map((host) => host.shadowRoot.textContent),
    states: Array.from(document.querySelectorAll("[data-plotdown]:not(script)")).map((el) => el.getAttribute("data-plotdown"))
  }));

const waitForCharts = (page, count) => page.waitForFunction((n) => document.querySelectorAll("plotdown-chart").length >= n, count, {timeout: 10000});

await test("module script renders a language-plot block under script-src 'self'", async (page) => {
  await page.goto(`${origin}/sample/markdown-it.html`);
  await waitForCharts(page, 2);
  const result = await inspect(page);
  assert.equal(result.charts.length, 2);
  for (const chart of result.charts) {
    assert.ok(chart.svg && chart.marks > 0, "the chart has marks");
    // Plot's own CSS (max-width: 100%) applies although inline <style> is forbidden.
    assert.equal(chart.maxWidth, "100%");
    assert.equal(chart.styleElements, 0);
    assert.ok(chart.hiddenBlock, "the source block is hidden");
  }
  assert.deepEqual(result.errors, []);
  // The JS block stays code.
  assert.equal(await page.locator("code.language-js").isVisible(), true);
});

await test("classic script with GitHub markup: plot, oplot and observable-plot render, gnuplot stays code", async (page) => {
  await page.goto(`${origin}/sample/github.html?script=classic`);
  await waitForCharts(page, 3);
  await page.waitForTimeout(200);
  const result = await inspect(page);
  assert.equal(result.charts.length, 3);
  assert.deepEqual(result.errors, []);
  const gnuplot = page.locator("div.highlight-source-gnuplot", {hasText: "set terminal"});
  assert.equal(await gnuplot.isVisible(), true);
  assert.equal(await gnuplot.getAttribute("data-plotdown"), null);
  assert.equal(await page.evaluate(() => typeof window.plotdown?.renderAll), "function");
});

await test("github.com markup with its wrappers", async (page) => {
  await page.goto(`${origin}/sample/github-live.html`);
  await waitForCharts(page, 2);
  await page.waitForTimeout(200);
  assert.equal((await inspect(page)).charts.length, 2);
  assert.equal(await page.locator("div.highlight-source-gnuplot", {hasText: "set terminal"}).isVisible(), true);
  assert.equal(await page.locator("div.highlight-source-shell").isVisible(), true);
});

await test("GitLab markup", async (page) => {
  await page.goto(`${origin}/sample/gitlab.html`);
  await waitForCharts(page, 2);
  assert.equal((await inspect(page)).charts.length, 2);
  assert.equal(await page.locator("pre.language-ruby").isVisible(), true);
});

// Each site's sample: its two plot blocks render with their header hidden, its other code stays visible.
const SITES = [
  {file: "gitea.html", code: "code.language-shell"},
  {file: "forgejo.html", code: "code.language-shellsession"},
  {file: "bitbucket.html", code: "div.codehilite", text: "not a chart"},
  {file: "azure-devops.html", code: "code.yaml"},
  {file: "chatgpt.html", code: 'code[data-code-language="python"]'},
  {file: "claude.html", code: "code.language-sql"},
  {file: "gemini.html", code: "code-block", text: "print"}
];
for (const {file, code, text} of SITES) {
  await test(`${file.replace(".html", "")} markup`, async (page) => {
    await page.goto(`${origin}/sample/${file}?script=classic&attrstyle=1`);
    await waitForCharts(page, 2);
    await page.waitForTimeout(200);
    const result = await inspect(page);
    assert.equal(result.charts.length, 2);
    assert.deepEqual(result.errors, []);
    for (const chart of result.charts) assert.ok(chart.svg && chart.marks > 0 && chart.hiddenBlock);
    assert.equal(await page.locator(code, text ? {hasText: text} : {}).first().isVisible(), true);
  });
}

await test("a ChatGPT answer streamed in its own markup renders once, its label hidden", async (page) => {
  await page.goto(`${origin}/sample/empty`);
  await page.waitForFunction(() => !!window.plotdown);
  const log = await page.evaluate(async () => {
    const seen = {errors: 0, charts: new Set()};
    new MutationObserver(() => {
      seen.errors += document.querySelectorAll("plotdown-error").length;
      for (const chart of document.querySelectorAll("plotdown-chart")) seen.charts.add(chart);
    }).observe(document.body, {childList: true, subtree: true});
    // As chatgpt.com does: the label and the <pre> first, the text in chunks, the copy button at the end.
    const main = document.querySelector("main");
    main.insertAdjacentHTML("beforeend", `<section><p>Here:</p><div class="wrap"><div><span>plot</span></div><pre><code data-code-language="plot"></code></pre></div></section>`);
    const code = main.querySelector("code");
    const text = JSON.stringify({title: "Streamed", marks: [{mark: "barY", data: [{a: "x", b: 1}, {a: "y", b: 3}], x: "a", y: "b"}]}, null, 2);
    for (const chunk of text.match(/[\s\S]{1,12}/g)) {
      code.append(chunk);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    main.querySelector(".wrap").insertAdjacentHTML("afterbegin", `<span data-message-content-controls=""><button aria-label="Copy code"></button></span>`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {errors: seen.errors, charts: seen.charts.size, now: document.querySelectorAll("plotdown-chart").length, label: getComputedStyle(main.querySelector(".wrap")).display};
  });
  assert.deepEqual(log, {errors: 0, charts: 1, now: 1, label: "none"});
});

await test("a block streamed piece by piece renders once, when complete, with no error on the way", async (page) => {
  await page.goto(`${origin}/sample/empty`);
  await page.waitForFunction(() => !!window.plotdown);
  const log = await page.evaluate(async () => {
    const seen = {errors: 0, charts: new Set(), chartsBeforeEnd: 0};
    new MutationObserver(() => {
      seen.errors += document.querySelectorAll("plotdown-error").length;
      for (const chart of document.querySelectorAll("plotdown-chart")) seen.charts.add(chart);
    }).observe(document.body, {childList: true, subtree: true});
    // As a chat UI does: a message, then a code block whose text grows token by token.
    const main = document.querySelector("main");
    main.insertAdjacentHTML("beforeend", "<div class='message'><p>Here is the chart:</p><pre><code class='language-plot'></code></pre></div>");
    const code = main.querySelector("code");
    const text = JSON.stringify({title: "Streamed", y: {grid: true}, marks: [{mark: "barY", data: [{a: "x", b: 1}, {a: "y", b: 3}, {a: "z", b: 2}], x: "a", y: "b", fill: "a"}, {mark: "ruleY", data: [0]}]}, null, 2);
    const tokens = text.match(/.{1,4}/gs);
    for (const [i, token] of tokens.entries()) {
      if (i % 3 === 0) code.append(token);
      else code.lastChild.data += token;
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (i < tokens.length - 1) seen.chartsBeforeEnd += document.querySelectorAll("plotdown-chart").length;
    }
    main.insertAdjacentHTML("beforeend", "<p>Done.</p>");
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {errors: seen.errors, charts: seen.charts.size, chartsBeforeEnd: seen.chartsBeforeEnd, now: document.querySelectorAll("plotdown-chart").length};
  });
  assert.deepEqual(log, {errors: 0, charts: 1, chartsBeforeEnd: 0, now: 1});
});

await test("follows a dark page", async (page) => {
  await page.goto(`${origin}/sample/markdown-it.html?dark=1`);
  await waitForCharts(page, 2);
  const [chart] = (await inspect(page)).charts;
  assert.equal(chart.scheme, "dark");
  assert.equal(chart.plotBackground, "rgb(13, 17, 23)");
});

await test("data-auto=false waits for plotdown.start()", async (page) => {
  await page.goto(`${origin}/sample/pandoc.html?attrs=data-auto%3D%22false%22`);
  await page.waitForFunction(() => !!window.plotdown);
  await page.waitForTimeout(300);
  assert.equal((await inspect(page)).charts.length, 0);
  await page.evaluate(() => window.plotdown.start());
  await waitForCharts(page, 2);
  assert.equal((await inspect(page)).charts.length, 2);
});

await test("the chart/source toggle", async (page) => {
  await page.goto(`${origin}/sample/pandoc.html`);
  await waitForCharts(page, 2);
  const host = page.locator("plotdown-chart").first();
  const button = host.locator("button[aria-pressed]");
  const height = () => host.evaluate((element) => element.getBoundingClientRect().height);
  const withChart = await height();
  await button.click();
  assert.equal(await page.locator("pre.plot").first().isVisible(), true);
  // With its source showing, the chart element holds only its toolbar.
  assert.ok((await height()) < Math.min(60, withChart), "the chart element shrinks to its toolbar");
  await button.click();
  assert.equal(await page.locator("pre.plot").first().isVisible(), false);
});

await test("the Copy menu copies JSON, PNG and SVG", async (page) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {origin});
  await page.goto(`${origin}/sample/pandoc.html`);
  await waitForCharts(page, 2);
  const host = page.locator("plotdown-chart").first();
  const copy = async (label) => {
    await host.locator(".copy > button").click();
    await host.getByRole("menuitem", {name: label}).click();
    await page.waitForFunction(() => document.querySelector("plotdown-chart").shadowRoot.querySelector(".copy > button[data-state]"));
    const state = await host.locator(".copy > button").getAttribute("data-state");
    assert.equal(state, "done", await host.locator(".copy > button").getAttribute("title"));
    const clip = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      if (item.types.includes("image/png")) {
        const bitmap = await createImageBitmap(await item.getType("image/png"));
        return {type: "image/png", width: bitmap.width, height: bitmap.height};
      }
      return {type: "text/plain", text: await (await item.getType("text/plain")).text()};
    });
    await page.waitForFunction(() => !document.querySelector("plotdown-chart").shadowRoot.querySelector(".copy > button[data-state]"), null, {timeout: 5000});
    return clip;
  };
  const json = await copy("JSON");
  assert.ok(Array.isArray(JSON.parse(json.text).marks), "JSON: the block");
  const svg = await copy("SVG");
  assert.match(svg.text, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  const png = await copy("PNG");
  assert.equal(png.type, "image/png");
  assert.ok(png.width > 200 && png.height > 100, `PNG of ${png.width}x${png.height}`);
});

await browser.close();
server.close();

for (const file of ["plotdown.js", "plotdown.iife.js"]) {
  const bytes = fs.readFileSync(path.join(packageDir, "dist", file));
  const gzip = zlib.gzipSync(bytes, {level: 9}).length;
  const brotli = zlib.brotliCompressSync(bytes, {params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 11}}).length;
  console.log(`size: dist/${file} ${(bytes.length / 1024).toFixed(1)} kB, gzip ${(gzip / 1024).toFixed(1)} kB, brotli ${(brotli / 1024).toFixed(1)} kB`);
}

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log("all passed");
