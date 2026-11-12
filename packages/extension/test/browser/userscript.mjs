// dist/plotdown.user.js in a real browser, without the extension, run as a
// userscript manager runs it (in the page, after load, outside its CSP):
// a page with a block gets charts; a page without one never runs plotdown.js;
// a block added later starts it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {startServer} from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.resolve(here, "../../dist/plotdown.user.js"), "utf8");
const channels = process.env.PLOTDOWN_BROWSER ? [process.env.PLOTDOWN_BROWSER] : ["chromium", "msedge", "chrome"];
let browser;
for (const channel of channels) {
  browser = await chromium.launch({channel}).catch((error) => (channel === channels.at(-1) ? Promise.reject(error) : undefined));
  if (browser) break;
}
const {origin, close} = await startServer();
const page = await browser.newPage();
const run = () => page.evaluate(script);
const state = () => page.evaluate(() => ({charts: document.querySelectorAll("plotdown-chart").length, loaded: typeof window.plotdown}));

await page.goto(`${origin}/github`);
await run();
await page.waitForFunction(() => document.querySelectorAll("plotdown-chart").length >= 5, null, {timeout: 10000});
assert.equal((await state()).charts, 5);
console.log("ok - GitHub markup: plot, oplot and observable-plot render, gnuplot stays code");

await page.goto(`${origin}/empty`);
await run();
await page.waitForTimeout(500);
assert.deepEqual(await state(), {charts: 0, loaded: "undefined"});
console.log("ok - a page without a block never runs plotdown.js");

await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", `<pre><code class="language-plot">{"marks": [{"mark": "dot", "data": [1, 2, 3], "x": [1, 2, 3]}]}</code></pre>`));
await page.waitForFunction(() => document.querySelectorAll("plotdown-chart").length === 1, null, {timeout: 10000});
assert.equal((await state()).loaded, "object");
console.log("ok - a block added later starts it");

await browser.close();
close();
console.log("all passed");
