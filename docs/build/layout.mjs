// @ts-check
// The frame of every page: head, masthead, footer.
import {REPO, SITE} from "./catalog.mjs";

/**
 * @typedef {object} Assets
 * @property {string} css
 * @property {string} theme
 * @property {string} site
 * @property {string} playground
 * @property {string} font
 * @property {string} schema The path of the JSON Schema.
 */

/**
 * @typedef {object} PageOptions
 * @property {string} url The path of the page, such as "/recipes/hugo/".
 * @property {string} title
 * @property {string} description
 * @property {string} body The HTML of <main>.
 * @property {string} kind A class of <body>: home, doc, recipe, gallery, playground.
 * @property {Assets} assets
 * @property {boolean} [plotdown] Load plotdown.js (default true).
 * @property {Record<string, string>} [plotdownData] data-* attributes of the plotdown.js tag.
 * @property {string[]} [scripts] More module scripts.
 * @property {string} [nav] Which entry of the masthead is current.
 */

const NAV = [
  {id: "playground", href: "/playground/", label: "Playground"},
  {id: "gallery", href: "/gallery/", label: "Gallery"},
  {id: "recipes", href: "/recipes/", label: "Recipes"},
  {id: "spec", href: "/spec/", label: "Spec"}
];

/** @param {PageOptions} page */
export function layout(page) {
  const {assets} = page;
  const title = page.url === "/" ? page.title : `${page.title} · plotdown`;
  const data = Object.entries(page.plotdownData ?? {})
    .map(([key, value]) => ` data-${key}="${escapeAttr(value)}"`)
    .join("");
  const scripts = [
    page.plotdown === false ? "" : `<script type="module" src="/plotdown.js"${data}></script>`,
    `<script type="module" src="${assets.site}"></script>`,
    ...(page.scripts ?? []).map((src) => `<script type="module" src="${src}"></script>`)
  ].filter(Boolean);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(page.description)}">
<link rel="canonical" href="${SITE}${page.url}">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(page.description)}">
<meta property="og:url" content="${SITE}${page.url}">
<meta property="og:type" content="website">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${assets.font}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.css}">
<script src="${assets.theme}"></script>
${scripts.join("\n")}
</head>
<body class="page-${page.kind}">
<a class="skip" href="#main">Skip to the content</a>
<header class="masthead">
  <a class="wordmark" href="/" aria-label="plotdown, home"><span class="ticks" aria-hidden="true">\`\`\`</span>plotdown</a>
  <nav aria-label="Site">
    ${NAV.map((item) => `<a href="${item.href}"${item.id === page.nav ? ' aria-current="page"' : ""}>${item.label}</a>`).join("\n    ")}
    <a href="${REPO}">GitHub</a>
  </nav>
  <button type="button" class="theme-switch" data-theme-switch aria-label="Switch to the dark theme" title="Switch to the dark theme"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.75a7.25 7.25 0 0 1 0 14.5z" fill="currentColor"/></svg></button>
</header>
<main id="main">
${page.body}
</main>
<footer class="colophon">
  <p>plotdown is open source under the MIT license: <a href="${REPO}">devlooped/plotdown</a>. Charts are drawn by <a href="https://observablehq.com/plot/">Observable Plot</a> (ISC).</p>
  <p>plotdown is not affiliated with Observable, Inc.</p>
  <p class="files"><a href="/llms.txt">llms.txt</a> <a href="/llms-full.txt">llms-full.txt</a> <a href="${assets.schema}">plot.schema.json</a> <a href="/plotdown.js">plotdown.js</a> <a href="/privacy/">Privacy</a></p>
</footer>
</body>
</html>
`;
}

/** @param {string} text */
export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** @param {string} text */
export function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;");
}
