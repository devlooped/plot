// The known-hosts variant (node build.mjs --sites=known) in a real Chromium:
// a listed host (github.com) renders; a host not listed nor granted gets no
// detector and no plotdown.js.
// The popup's "Allow on <site>" needs a click on the toolbar button (activeTab
// gives it the tab's address) and the browser's permission prompt, which
// automation cannot answer: that step is checked by hand (store/readme.md).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {startServer} from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, "../../dist/chrome-known");
assert.ok(fs.existsSync(path.join(extensionDir, "manifest.json")), "build it first: node build.mjs --sites=known");
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "plotdown-known-"));
const channel = process.env.PLOTDOWN_BROWSER ?? "msedge";
const context = await chromium.launchPersistentContext(userDataDir, {
  channel,
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`]
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const {origin, close} = await startServer();
const charts = (page) => page.evaluate(() => document.querySelectorAll("plotdown-chart").length);

const page = await context.newPage();
await page.goto("https://github.com/devlooped/plotdown/blob/main/spec/spec.md");
await page.waitForFunction(() => document.querySelectorAll("plotdown-chart").length >= 1, null, {timeout: 15000});
console.log("ok - github.com, a listed host, renders");

await page.goto(`${origin}/github`);
await page.waitForTimeout(2000);
assert.equal(await charts(page), 0);
const injected = await worker.evaluate(async () => (await chrome.storage.session.get("injections")).injections ?? []);
assert.deepEqual(injected.filter((entry) => entry.url.startsWith("http://127.0.0.1")), []);
console.log("ok - a host not listed gets nothing");

await context.close();
close();
fs.rmSync(userDataDir, {recursive: true, force: true});
console.log("all passed");