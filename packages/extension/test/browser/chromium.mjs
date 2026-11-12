// The extension loaded unpacked in a real Chromium, on live github.com and on
// local pages. Run after `pnpm build`: `pnpm test:browser`. It needs the
// network (github.com).
//
// Browser: Playwright's Chromium if installed, else the installed Edge, else
// Chrome (PLOTDOWN_BROWSER=chromium|msedge|chrome picks one). Recent branded
// Chrome ignores --load-extension; Edge 156 still honours it. PLOTDOWN_OFFLINE=1 skips the
// live pages. Screenshots go to test/browser/results (ignored by git);
// PLOTDOWN_STORE_IMAGES=1 also writes the store screenshots to store/images.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {startServer} from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(here, "../..");
const extensionDir = path.join(packageDir, "dist", "chrome");
const resultsDir = path.join(here, "results");
const storeImages = path.join(packageDir, "store", "images");
fs.mkdirSync(resultsDir, {recursive: true});
assert.ok(fs.existsSync(path.join(extensionDir, "manifest.json")), "build the extension first: pnpm build");

const {origin, close: closeServer} = await startServer();

// ---------------------------------------------------------------- the browser
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "plotdown-ext-"));
const launch = (channel) =>
  chromium.launchPersistentContext(userDataDir, {
    channel,
    viewport: {width: 1280, height: 800},
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`]
  });
const channels = process.env.PLOTDOWN_BROWSER ? [process.env.PLOTDOWN_BROWSER] : ["chromium", "msedge", "chrome"];
let context, channel;
for (channel of channels) {
  context = await launch(channel).catch((error) => (channel === channels.at(-1) ? Promise.reject(error) : undefined));
  if (context) break;
}
let [worker] = context.serviceWorkers();
worker ??= await context.waitForEvent("serviceworker", {timeout: 10000}).catch(() => undefined);
assert.ok(worker, `the extension did not load in ${channel} (branded Chrome and Edge ignore --load-extension)`);
const extensionId = new URL(worker.url()).host;
console.log(`browser: ${channel} ${context.browser()?.version() ?? ""}, extension ${extensionId}`);

/** The injections of plotdown.js the background made, for pages whose address starts with prefix. */
const injections = async (prefix) =>
  (await worker.evaluate(async () => (await chrome.storage.session.get("injections")).injections ?? [])).filter((entry) => entry.url.startsWith(prefix));
const tabIdOf = (url) => worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id, url);

const inspect = (page) =>
  page.evaluate(() => ({
    charts: Array.from(document.querySelectorAll("plotdown-chart")).map((host) => {
      // The chart's own svg comes after the legends, if any (a ramp legend is an svg too).
      const svg = Array.from(host.shadowRoot?.querySelectorAll("svg") ?? []).at(-1);
      return {marks: svg ? svg.querySelectorAll("rect, circle, path, line").length : 0, maxWidth: svg ? getComputedStyle(svg).maxWidth : null};
    }),
    errors: Array.from(document.querySelectorAll("plotdown-error")).map((host) => host.shadowRoot?.textContent)
  }));
const waitForCharts = (page, count, timeout = 15000) =>
  page.waitForFunction((n) => document.querySelectorAll("plotdown-chart").length >= n, count, {timeout});
const settle = (page, ms = 1500) => page.waitForTimeout(ms);

let failures = 0;
async function test(title, fn) {
  const page = await context.newPage();
  try {
    await fn(page);
    console.log(`ok - ${title}`);
  } catch (error) {
    failures++;
    console.log(`not ok - ${title}\n  ${String(error?.stack ?? error).split("\n").join("\n  ")}`);
  } finally {
    await page.screenshot({path: path.join(resultsDir, `chromium-${title.replace(/[^\w]+/g, "-").replace(/-$/, "")}.png`), fullPage: false}).catch(() => {});
    await page.close();
  }
}

const assertStyled = (charts) => {
  for (const chart of charts) {
    assert.ok(chart.marks > 0, "the chart has marks");
    assert.equal(chart.maxWidth, "100%", "Plot's own styles apply");
  }
};

// ---------------------------------------------------------------- live github.com
if (!process.env.PLOTDOWN_OFFLINE) {
  await test("live github.com: the plot blocks of SKILL.md render", async (page) => {
    const url = "https://github.com/devlooped/plotdown/blob/main/skills/plot/SKILL.md";
    await page.goto(url);
    await waitForCharts(page, 8);
    await settle(page);
    const result = await inspect(page);
    assert.ok(result.charts.length >= 8, `${result.charts.length} charts`);
    assertStyled(result.charts);
    assert.deepEqual(result.errors, []);
    if (process.env.PLOTDOWN_STORE_IMAGES) {
      await page.locator("plotdown-chart").nth(1).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -120));
      await page.screenshot({path: path.join(storeImages, "screenshot-github-1280x800.png")});
    }
  });

  await test("live github.com: the plot block of spec.md renders", async (page) => {
    await page.goto("https://github.com/devlooped/plotdown/blob/main/spec/spec.md");
    await waitForCharts(page, 1);
    await settle(page);
    const result = await inspect(page);
    assertStyled(result.charts);
    assert.deepEqual(result.errors, []);
  });

  await test("live github.com: plot and oplot blocks of the repository's readme render", async (page) => {
    await page.goto("https://github.com/devlooped/plotdown");
    await waitForCharts(page, 3);
    await settle(page);
    const result = await inspect(page);
    assert.equal(result.charts.length, 3, "two plot blocks and one oplot block");
    assertStyled(result.charts);
    assert.equal(await page.locator('pre[lang="oplot"]').first().evaluate((pre) => pre.closest("[data-plotdown]")?.getAttribute("data-plotdown")), "rendered");
    assert.deepEqual(result.errors, []);
  });

  await test("live github.com: a real gnuplot block stays code, and the page never receives plotdown.js", async (page) => {
    const url = "https://github.com/rigtorp/c2clat";
    await page.goto(url);
    await page.locator("div.highlight-source-gnuplot").first().waitFor();
    await settle(page, 2500);
    const gnuplot = page.locator("div.highlight-source-gnuplot").first();
    assert.equal(await gnuplot.isVisible(), true);
    assert.equal(await gnuplot.getAttribute("data-plotdown"), null);
    assert.equal((await inspect(page)).charts.length, 0);
    assert.deepEqual(await injections(url), []);
  });

  await test("live github.com: a page without a block never receives plotdown.js", async (page) => {
    const url = "https://github.com/devlooped/plotdown/blob/main/LICENSE";
    await page.goto(url);
    await settle(page, 2500);
    assert.deepEqual(await injections(url), []);
  });
}

// ---------------------------------------------------------------- local pages
await test("local copy of GitHub markup: plot, oplot and observable-plot render, gnuplot stays code (strict CSP)", async (page) => {
  await page.goto(`${origin}/github`);
  await waitForCharts(page, 5);
  await settle(page, 500);
  const result = await inspect(page);
  assert.equal(result.charts.length, 5, "github-live.html: plot and oplot; github.html: plot, oplot and observable-plot");
  assertStyled(result.charts);
  assert.deepEqual(result.errors, []);
  for (const gnuplot of await page.locator("div.highlight-source-gnuplot", {hasText: "set terminal"}).all()) {
    assert.equal(await gnuplot.isVisible(), true);
    assert.equal(await gnuplot.getAttribute("data-plotdown"), null);
  }
  assert.equal((await injections(`${origin}/github`)).length, 1, "one injection");
});

await test("local: a page with only gnuplot or no block never receives plotdown.js", async (page) => {
  for (const name of ["/gnuplot", "/empty"]) {
    await page.goto(origin + name);
    await settle(page, 1000);
    // Content the page adds later, without a block, does not change that.
    await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", "<pre><code class='language-js'>1</code></pre>"));
    await settle(page, 500);
    assert.deepEqual(await injections(origin + name), [], name);
    assert.equal((await inspect(page)).charts.length, 0);
  }
});

await test("local: a block added after load renders", async (page) => {
  await page.goto(`${origin}/late`);
  await settle(page, 800);
  assert.deepEqual(await injections(`${origin}/late`), [], "nothing injected before the block arrives");
  await waitForCharts(page, 1);
  assertStyled((await inspect(page)).charts);
  assert.equal((await injections(`${origin}/late`)).length, 1);
});

await test("local: a block streamed as a chat answer renders when complete", async (page) => {
  await page.goto(`${origin}/stream`);
  await waitForCharts(page, 1);
  await settle(page, 3500);
  const result = await inspect(page);
  assert.equal(result.charts.length, 1);
  assert.deepEqual(result.errors, []);
});

await test("the per-site switch works and survives a reload", async (page) => {
  const url = `${origin}/github`;
  await page.goto(url);
  await waitForCharts(page, 5);
  const tabId = await tabIdOf(url);
  assert.ok(tabId, "tab id");
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await popup.locator("#status").filter({hasText: /\w/}).waitFor({timeout: 5000});
  assert.equal(await popup.locator("#status").textContent(), "5 charts on this page.");
  assert.equal(await popup.locator("#host").textContent(), "127.0.0.1");
  assert.equal(await popup.locator("#site").isChecked(), true);
  const before = (await injections(url)).length;

  // Off: the popup reloads the tab, which shows code and gets no plotdown.js.
  await Promise.all([page.waitForEvent("load"), popup.locator("#site").uncheck()]);
  await settle(page, 1000);
  assert.equal((await inspect(page)).charts.length, 0, "no chart when off");
  await page.reload();
  await settle(page, 1000);
  assert.equal((await inspect(page)).charts.length, 0, "still off after a reload");
  assert.equal((await injections(url)).length, before, "no injection while off");
  await popup.reload();
  assert.equal(await popup.locator("#site").isChecked(), false, "the popup shows it off");

  // Other sites are not affected; the global switch stays on.
  assert.equal(await popup.locator("#global").isChecked(), true);

  // On again.
  await Promise.all([page.waitForEvent("load"), popup.locator("#site").check()]);
  await waitForCharts(page, 5);
  await popup.close();
});

await test("the global switch turns every site off", async (page) => {
  await worker.evaluate(() => chrome.storage.local.set({settings: {enabled: false, off: []}}));
  await page.goto(`${origin}/github?global`);
  await settle(page, 1500);
  assert.equal((await inspect(page)).charts.length, 0);
  assert.deepEqual(await injections(`${origin}/github?global`), []);
  await worker.evaluate(() => chrome.storage.local.set({settings: {enabled: true, off: []}}));
});

await context.close();
closeServer();
fs.rmSync(userDataDir, {recursive: true, force: true});
if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log("all passed");