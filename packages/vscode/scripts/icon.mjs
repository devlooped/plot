// Draws media/icon.svg as media/icon.png (256 by 256: the Marketplace and Open
// VSX want a PNG of at least 128 pixels). Uses the installed Edge or Chrome
// through Playwright: PLOTDOWN_BROWSER=chrome|msedge (default msedge).
import {readFileSync} from "node:fs";
import {chromium} from "playwright";

const svg = readFileSync(new URL("../media/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch({channel: process.env.PLOTDOWN_BROWSER ?? "msedge"});
try {
  const page = await browser.newPage({viewport: {width: 256, height: 256}});
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator("svg").screenshot({path: new URL("../media/icon.png", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), omitBackground: true});
} finally {
  await browser.close();
}
console.log("media/icon.png");
