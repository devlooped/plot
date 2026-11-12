// The extension as a temporary add-on in Firefox, driven over WebDriver BiDi:
// charts render on live github.com and on a local page under a strict policy,
// with their styles (Firefox refuses constructed style sheets from content
// scripts, so plotdown.js falls back to <style> elements there).
// Run after `pnpm build`: `pnpm test:firefox`. PLOTDOWN_FIREFOX=<path to
// firefox> picks the binary; PLOTDOWN_OFFLINE=1 skips github.com;
// PLOTDOWN_HEADED=1 shows the window.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {evaluate, findFirefox, launchFirefox} from "./bidi.mjs";
import {startServer} from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(here, "../..");
const extensionDir = path.join(packageDir, "dist", "firefox");
const resultsDir = path.join(here, "results");
fs.mkdirSync(resultsDir, {recursive: true});
assert.ok(fs.existsSync(path.join(extensionDir, "manifest.json")), "build the extension first: pnpm build");

const binary = findFirefox();
assert.ok(binary, "Firefox not found: set PLOTDOWN_FIREFOX");
const firefox = await launchFirefox({binary, headless: !process.env.PLOTDOWN_HEADED});
const {send} = firefox;
const {extension} = await send("webExtension.install", {extensionData: {type: "path", path: extensionDir}});
console.log(`browser: ${firefox.name} ${firefox.version} (${binary}), add-on ${extension}`);
const {origin, close: closeServer} = await startServer();

// The first tab (creating a foreground tab hangs in headless Firefox; background tabs are fine).
const {contexts: [{context}]} = await send("browsingContext.getTree", {maxDepth: 0});
await send("browsingContext.setViewport", {context, viewport: {width: 1280, height: 800}});
const go = (url) => send("browsingContext.navigate", {context, url, wait: "complete"});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const INSPECT = `JSON.stringify({
  charts: Array.from(document.querySelectorAll("plotdown-chart")).map((host) => {
    const root = host.shadowRoot;
    const svg = Array.from(root.querySelectorAll("svg")).at(-1);
    let adopted = null;
    try { adopted = root.adoptedStyleSheets.length; } catch {}
    return {
      marks: svg ? svg.querySelectorAll("rect, circle, path, line").length : 0,
      maxWidth: svg ? getComputedStyle(svg).maxWidth : null,
      // The toolbar's button: styled by plotdown's own sheet.
      buttonRadius: root.querySelector("button") ? getComputedStyle(root.querySelector("button")).borderTopLeftRadius : null,
      styleElements: root.querySelectorAll("style").length,
      adopted
    };
  }),
  errors: Array.from(document.querySelectorAll("plotdown-error")).map((host) => host.shadowRoot.textContent)
})`;
const inspect = () => evaluate(send, context, INSPECT);
async function waitForCharts(count, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    const result = await inspect();
    if (result.charts.length >= count || Date.now() > end) return result;
    await sleep(250);
  }
}

let failures = 0;
async function test(title, fn) {
  try {
    await fn();
    console.log(`ok - ${title}`);
  } catch (error) {
    failures++;
    console.log(`not ok - ${title}\n  ${String(error?.stack ?? error).split("\n").join("\n  ")}`);
  } finally {
    const shot = await send("browsingContext.captureScreenshot", {context}).catch(() => undefined);
    if (shot) fs.writeFileSync(path.join(resultsDir, `firefox-${title.replace(/[^\w]+/g, "-").replace(/-$/, "")}.png`), Buffer.from(shot.data, "base64"));
  }
}

const assertStyled = (charts) => {
  for (const chart of charts) {
    assert.ok(chart.marks > 0, "the chart has marks");
    assert.equal(chart.maxWidth, "100%", "Plot's own styles apply");
    assert.equal(chart.buttonRadius, "6px", "plotdown's own styles apply");
  }
};

// BiDi cannot open the extension's own pages (moz-extension:// navigation is
// refused), so the popup and the record of injections are tested in Chromium
// only (chromium.mjs); the code is the same.

if (!process.env.PLOTDOWN_OFFLINE) {
  await test("live github.com: SKILL.md renders with styles", async () => {
    await go("https://github.com/devlooped/plotdown/blob/main/skills/plot/SKILL.md");
    const result = await waitForCharts(8);
    assert.ok(result.charts.length >= 8, `${result.charts.length} charts`);
    assertStyled(result.charts);
    assert.deepEqual(result.errors, []);
    console.log(`  styles: ${result.charts[0].styleElements} <style> elements, adoptedStyleSheets ${result.charts[0].adopted}`);
  });

  await test("live github.com: the readme's plot and oplot blocks render", async () => {
    await go("https://github.com/devlooped/plotdown");
    const result = await waitForCharts(3);
    assert.equal(result.charts.length, 3);
    assertStyled(result.charts);
    assert.deepEqual(result.errors, []);
  });

  await test("live github.com: a real gnuplot block stays code", async () => {
    await go("https://github.com/rigtorp/c2clat");
    await sleep(2500);
    const state = await evaluate(send, context, `JSON.stringify(Array.from(document.querySelectorAll("div.highlight-source-gnuplot")).map((div) => [div.getAttribute("data-plotdown"), getComputedStyle(div).display]))`);
    assert.ok(state.length > 0, "the page has a gnuplot block");
    for (const [claimed, display] of state) {
      assert.equal(claimed, null);
      assert.notEqual(display, "none");
    }
    assert.equal((await inspect()).charts.length, 0);
  });
}

await test("local, strict CSP (style-src 'self'): charts keep their styles", async () => {
  await go(`${origin}/github`);
  const result = await waitForCharts(5);
  assert.equal(result.charts.length, 5);
  assertStyled(result.charts);
  assert.deepEqual(result.errors, []);
  console.log(`  styles: ${result.charts[0].styleElements} <style> elements, adoptedStyleSheets ${result.charts[0].adopted}`);
});

await test("local: a block added after load renders, with styles", async () => {
  await go(`${origin}/late`);
  const result = await waitForCharts(1);
  assert.equal(result.charts.length, 1);
  assertStyled(result.charts);
});

await test("local: a block streamed as a chat answer renders when complete", async () => {
  await go(`${origin}/stream`);
  await waitForCharts(1);
  await sleep(3500);
  const result = await inspect();
  assert.equal(result.charts.length, 1);
  assert.deepEqual(result.errors, []);
});

await firefox.close();
closeServer();
if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log("all passed");