// Draws the PNG icons from icons/icon.svg, and the store's promotional tiles,
// with Playwright's Chromium. Run by hand when the icon changes
// (`pnpm icons`); the PNG files are committed, so the build needs no browser.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const svg = fs.readFileSync(path.join(root, "icons", "icon.svg"), "utf8");
const images = path.join(root, "store", "images");
fs.mkdirSync(images, {recursive: true});

const browser = await chromium.launch().catch(() => chromium.launch({channel: "msedge"}));
const page = await browser.newPage({deviceScaleFactor: 1});

for (const size of [16, 32, 48, 96, 128]) {
  await page.setViewportSize({width: size, height: size});
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({path: path.join(root, "icons", `icon-${size}.png`), omitBackground: true});
}

// Promotional tiles: Chrome Web Store small tile (440x280) and marquee (1400x560);
// Edge Add-ons takes the same sizes. 300x300 is the Edge logo.
const tile = (width, height) => `<!DOCTYPE html><html><head><style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; }
  body { display: flex; align-items: center; justify-content: center; gap: ${height * 0.08}px;
         background: linear-gradient(135deg, #f6f8fa, #dde4ec); font-family: "Segoe UI", system-ui, sans-serif; color: #1f2a37; }
  svg { width: ${height * 0.45}px; height: ${height * 0.45}px; flex: none; }
  h1 { font-size: ${height * 0.17}px; margin: 0; font-weight: 700; letter-spacing: -0.02em; }
  p { font-size: ${height * 0.065}px; margin: ${height * 0.02}px 0 0; opacity: 0.8; max-width: ${width * 0.5}px; }
  code { font-family: Consolas, ui-monospace, monospace; background: #1f2a3712; padding: 0 0.2em; border-radius: 4px; }
</style></head><body>${svg}<div><h1>plotdown</h1><p>Turns <code>plot</code> code blocks into Observable Plot charts, on any page.</p></div></body></html>`;
for (const [width, height, name] of [[440, 280, "promo-small-440x280.png"], [1400, 560, "promo-marquee-1400x560.png"]]) {
  await page.setViewportSize({width, height});
  await page.setContent(tile(width, height));
  await page.screenshot({path: path.join(images, name)});
}
await page.setViewportSize({width: 300, height: 300});
await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:300px;height:300px}</style>${svg}`);
await page.screenshot({path: path.join(images, "logo-300x300.png"), omitBackground: true});

await browser.close();
console.log("icons and promotional tiles written");
