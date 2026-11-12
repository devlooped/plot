// @ts-check
// Builds the plotdown.cc site into docs/dist (or $PLOTDOWN_SITE_OUT):
//
//   pnpm --filter plotdown-site build      (after @devlooped/plotdown is built)
//
// Pages: / (home), /playground/, /gallery/, /spec/ (spec/spec.md), /recipes/
// and /recipes/<slug>/ (docs/recipes/*.md). Files at fixed paths: /llms.txt,
// /llms-full.txt, /schema/<version>/plot.schema.json and its stable alias
// /schema/plot.schema.json (the current version), /plotdown.js (the
// current build, which the pages load), /examples/<fixture>.json.
import {createHash} from "node:crypto";
import {existsSync, statSync} from "node:fs";
import {copyFile, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as esbuild from "esbuild";
import {parseHTML} from "linkedom";
import {render} from "@devlooped/plotdown";
import {FIXTURE_TITLES, GROUPS, REPO, SITE} from "./catalog.mjs";
import {layout} from "./layout.mjs";
import {createMarkdown} from "./markdown.mjs";
import {galleryBody, HERO_BLOCK, homeBody, notFoundBody, playgroundBody, recipeNav, recipesIndexBody, toc} from "./pages.mjs";

const docs = fileURLToPath(new URL("..", import.meta.url));
const root = path.resolve(docs, "..");
const out = path.resolve(docs, process.env.PLOTDOWN_SITE_OUT ?? "dist");
const started = Date.now();
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#16223a"/><rect x="7" y="17" width="4" height="8" rx="1" fill="#97bbf5"/><rect x="14" y="11" width="4" height="14" rx="1" fill="#97bbf5"/><rect x="21" y="6" width="4" height="19" rx="1" fill="#efb118"/></svg>\n`;

/** @param {string} file */
const readText = async (file) => (await readFile(file, "utf8")).replace(/\r\n?/g, "\n");
/** @param {string | Uint8Array} content */
const hash = (content) => createHash("sha256").update(content).digest("hex").slice(0, 10);
/** @type {string[]} */
const warnings = [];

// ---------------------------------------------------------------- inputs

const spec = await readText(path.join(root, "spec/spec.md"));
const version = /\*\*Spec version ([\d.]+)\*\*/.exec(spec)?.[1];
if (!version) throw new Error("spec/spec.md: no 'Spec version' line");
const schemaText = await readText(path.join(root, "spec/plot.schema.json"));
const schemaPath = `/schema/${version}/plot.schema.json`;
/** The current schema at a URL that does not change with the version, for catalogs such as SchemaStore. */
const latestSchemaPath = "/schema/plot.schema.json";
const schemaId = JSON.parse(schemaText).$id;
if (schemaId !== `${SITE}${schemaPath}`) throw new Error(`spec/plot.schema.json: $id is ${schemaId}, expected ${SITE}${schemaPath} (spec version ${version})`);

let plotdownJs;
try {
  plotdownJs = fileURLToPath(import.meta.resolve("@devlooped/plotdown/plotdown.js"));
} catch {
  plotdownJs = path.join(root, "packages/plotdown/dist/plotdown.js");
}
if (!existsSync(plotdownJs)) throw new Error(`${plotdownJs} is missing: build @devlooped/plotdown first (pnpm build at the root does both)`);
const plotdownDist = path.dirname(plotdownJs);

/** @type {import("./pages.mjs").Fixture[]} */
const fixtures = [];
for (const file of (await readdir(path.join(root, "spec/fixtures"))).filter((name) => name.endsWith(".json")).sort()) {
  const name = file.slice(0, -5);
  const text = (await readText(path.join(root, "spec/fixtures", file))).trimEnd();
  const block = JSON.parse(text);
  /** @type {Set<string>} */
  const marks = new Set();
  /** @type {Set<string>} */
  const transforms = new Set();
  for (const mark of block.marks ?? []) {
    marks.add(mark.mark);
    for (const transform of mark.transform ?? []) for (const key of Object.keys(transform)) transforms.add(key);
  }
  const title = /** @type {Record<string, string>} */ (FIXTURE_TITLES)[name] ?? (typeof block.title === "string" ? block.title : name);
  if (!(name in FIXTURE_TITLES)) warnings.push(`spec/fixtures/${file} has no title in build/catalog.mjs`);
  fixtures.push({name, title, text, marks: [...marks], transforms: [...transforms]});
}

/** @type {Map<string, import("./pages.mjs").RecipeInfo>} */
const recipes = new Map();
/** @type {Map<string, string>} */
const recipeSources = new Map();
const recipeDir = path.join(docs, "recipes");
for (const file of (await readdir(recipeDir)).filter((name) => name.endsWith(".md")).sort()) {
  const slug = file.slice(0, -3);
  const text = await readText(path.join(recipeDir, file));
  const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? slug;
  // A page that says it was not tried (even in part) is "from the docs".
  const status = /not tried/i.test(text) ? "docs" : /Tried with /.test(text) ? "tried" : "unknown";
  recipes.set(slug, {slug, title, status});
  recipeSources.set(slug, text);
}
const listed = new Set(GROUPS.flatMap((group) => group.recipes.map((recipe) => recipe.slug)));
for (const slug of listed) if (!recipes.has(slug)) warnings.push(`docs/recipes/${slug}.md is missing: its entry is listed without a link`);
for (const slug of recipes.keys()) if (!listed.has(slug)) warnings.push(`docs/recipes/${slug}.md is not in build/catalog.mjs: it has a page but no entry in the lists`);

// ---------------------------------------------------------------- links

/**
 * A link of a Markdown file of the repository, as a link of the site.
 * @param {string} href
 * @param {string} source The repository path of the Markdown file.
 */
function resolveLink(href, source) {
  if (/^(#|mailto:|data:)/i.test(href)) return href;
  if (href === SITE) return "/";
  if (href.startsWith(`${SITE}/`)) return href.slice(SITE.length);
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("/")) return href;
  const at = href.indexOf("#");
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(source), at < 0 ? href : href.slice(0, at))).replace(/\/$/, "");
  const fragment = at < 0 ? "" : href.slice(at);
  return siteUrl(target) + fragment;
}

/** @param {string} target A path from the root of the repository. */
function siteUrl(target) {
  if (target === "spec/spec.md") return "/spec/";
  if (target === "spec/plot.schema.json") return schemaPath;
  if (target === "spec/fixtures") return "/gallery/";
  let match = /^spec\/fixtures\/([\w-]+)\.json$/.exec(target);
  if (match) return `/playground/?example=${match[1]}`;
  match = /^docs\/recipes\/([\w-]+)\.md$/.exec(target);
  if (match && recipes.has(match[1] ?? "")) return `/recipes/${match[1]}/`;
  if (target === "docs/llms.txt") return "/llms.txt";
  if (target === "docs/llms-full.txt") return "/llms-full.txt";
  const full = path.join(root, target);
  if (!existsSync(full)) warnings.push(`a link points to ${target}, which does not exist`);
  const kind = existsSync(full) && statSync(full).isDirectory() ? "tree" : "blob";
  return `${REPO}/${kind}/main/${target}`;
}

// ---------------------------------------------------------------- output

await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});

/**
 * @param {string} relative
 * @param {string | Uint8Array} content
 */
async function emit(relative, content) {
  const file = path.join(out, relative);
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, content);
}

// Assets, with content hashes in their names: style, scripts, font.
const fontSource = fileURLToPath(import.meta.resolve("@fontsource-variable/recursive/files/recursive-latin-mono-normal.woff2"));
const font = await readFile(fontSource);
const fontPath = `/assets/recursive-${hash(font)}.woff2`;
await emit(fontPath, font);

const fontFace = `@font-face{font-family:"Recursive";font-style:normal;font-display:swap;font-weight:300 1000;src:url("${fontPath}") format("woff2-variations"),url("${fontPath}") format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n`;
const css = (await esbuild.transform(fontFace + (await readText(path.join(docs, "site/style.css"))), {loader: "css", minify: true, target: ["chrome111", "firefox113", "safari16.4"]})).code;
const cssPath = `/assets/style-${hash(css)}.css`;
await emit(cssPath, css);

/**
 * @param {string} entry
 * @param {"esm" | "iife"} format
 */
async function bundle(entry, format) {
  const result = await esbuild.build({
    entryPoints: [path.join(docs, "site", entry)],
    bundle: true,
    minify: true,
    format,
    target: "es2022",
    platform: "browser",
    write: false,
    legalComments: "none",
    logLevel: "warning"
  });
  const code = result.outputFiles[0]?.text ?? "";
  const name = entry.replace(/\.ts$/, "");
  const file = `/assets/${name}-${hash(code)}.js`;
  await emit(file, code);
  return file;
}

/** @type {import("./layout.mjs").Assets} */
const assets = {
  css: cssPath,
  font: fontPath,
  theme: await bundle("theme.ts", "iife"),
  site: await bundle("site.ts", "esm"),
  playground: await bundle("playground.ts", "esm"),
  schema: schemaPath
};

// Files at fixed paths.
for (const name of ["plotdown.js", "plotdown.js.map", "plotdown.iife.js", "plotdown.iife.js.map"]) {
  const file = path.join(plotdownDist, name);
  if (existsSync(file)) await copyFile(file, path.join(out, name));
  else if (!name.endsWith(".map")) throw new Error(`${file} is missing`);
}
for (const name of ["llms.txt", "llms-full.txt"]) {
  const file = path.join(docs, name);
  if (!existsSync(file)) throw new Error(`docs/${name} is missing`);
  await emit(name, await readText(file));
}
await emit(schemaPath, schemaText);
await emit(latestSchemaPath, schemaText);
for (const fixture of fixtures) await emit(`examples/${fixture.name}.json`, fixture.text + "\n");
await emit("favicon.svg", FAVICON);

// Pages.
const md = await createMarkdown({resolveLink});
/** @type {string[]} */
const urls = [];

/**
 * @param {Omit<import("./layout.mjs").PageOptions, "assets">} page
 */
async function page(page) {
  urls.push(page.url);
  const file = page.url === "/404.html" ? "404.html" : path.posix.join(page.url, "index.html");
  await emit(file, layout({...page, assets}));
}

// Home: the hero's chart is drawn here, at build time, by the core (an adapter would do the same);
// every other chart of the site is a block that plotdown.js draws in the page.
const {document} = parseHTML("<!doctype html><html><head></head><body></body></html>");
const heroChart = /** @type {Element} */ (/** @type {unknown} */ (render(HERO_BLOCK, {document: /** @type {Document} */ (/** @type {unknown} */ (document))}))).outerHTML;
const heroSource = withFence(md.highlight(HERO_BLOCK, "json"), "plot");
const specMarkdown = /````markdown\n([\s\S]*?)\n````/.exec(spec)?.[1];
const specJs = /```js\n(Plot\.plot\([\s\S]*?)\n```/.exec(spec)?.[1];
if (!specMarkdown || !specJs) throw new Error("spec/spec.md: the first example (a ````markdown block and its ```js form) was not found");

await page({
  url: "/",
  kind: "home",
  nav: "",
  title: "plotdown: charts you write in Markdown",
  description: "A plot block holds the options of Observable Plot as strict JSON. plotdown draws it as a chart on GitHub, GitLab, docs sites, editors and chat apps.",
  body: homeBody({
    heroSource,
    heroChart,
    fixtures,
    recipes,
    specMarkdown: md.highlight(specMarkdown, "markdown"),
    specJs: md.highlight(specJs, "js"),
    schemaUrl: schemaPath
  })
});

await page({
  url: "/gallery/",
  kind: "gallery",
  nav: "gallery",
  title: "Gallery",
  description: "30 plot blocks, one for each family of Observable Plot marks, drawn by plotdown.js.",
  body: galleryBody({fixtures})
});

await page({
  url: "/playground/",
  kind: "playground",
  nav: "playground",
  title: "Playground",
  description: "Write a plot block and see the chart as you type. Share it as a link, copy it as Markdown.",
  body: playgroundBody({fixtures, starter: HERO_BLOCK}),
  plotdownData: {settle: "700", toggle: "false"},
  scripts: [assets.playground]
});

{
  /** @type {import("./markdown.mjs").MarkdownEnv} */
  const env = {source: "spec/spec.md"};
  const html = md.render(spec, env);
  await page({
    url: "/spec/",
    kind: "doc",
    nav: "spec",
    title: "Spec",
    description: `The plotdown block, spec version ${version}: the JSON form of Observable Plot's Plot.plot() options, with marks and transforms as data.`,
    body: `<div class="doc-layout">${toc(env.headings ?? [])}<article class="prose">${html}</article></div>`
  });
}

await page({
  url: "/recipes/",
  kind: "recipes",
  nav: "recipes",
  title: "Recipes",
  description: "How to render plot blocks in Hugo, MkDocs, Jekyll, Docusaurus, VitePress, Astro, GitHub, GitLab, React, Obsidian and more.",
  body: recipesIndexBody({recipes})
});

for (const [slug, text] of recipeSources) {
  /** @type {import("./markdown.mjs").MarkdownEnv} */
  const env = {source: `docs/recipes/${slug}.md`};
  const html = md.render(text, env);
  const info = recipes.get(slug);
  const lede = /^# .+\n+([^\n#>`|<-][^\n]*)/m.exec(text)?.[1] ?? "";
  await page({
    url: `/recipes/${slug}/`,
    kind: "recipe",
    nav: "recipes",
    title: info?.title ?? slug,
    description: plain(lede) || `How to render plot blocks with ${info?.title ?? slug}.`,
    body: `<div class="doc-layout">${recipeNav(slug, recipes)}<article class="prose">${html}<p class="edit-page"><a href="${REPO}/blob/main/docs/recipes/${slug}.md">Edit this page on GitHub</a></p></article></div>`
  });
}

// The privacy policy of the browser extension and the userscript: the stores take it as a URL.
{
  const source = "packages/extension/store/privacy.md";
  /** @type {import("./markdown.mjs").MarkdownEnv} */
  const env = {source};
  const html = md.render(await readText(path.join(root, source)), env);
  await page({
    url: "/privacy/",
    kind: "doc",
    nav: "",
    title: "Privacy policy",
    description: "The plotdown browser extension and userscript collect no data and make no network request.",
    body: `<div class="doc-layout"><article class="prose">${html}</article></div>`
  });
}

await page({url: "/404.html", kind: "doc", nav: "", title: "Not found", description: "This page does not exist.", body: notFoundBody()});

await emit("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
await emit(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .filter((url) => url.endsWith("/"))
    .map((url) => `  <url><loc>${SITE}${url}</loc></url>`)
    .join("\n")}\n</urlset>\n`
);

for (const warning of warnings) console.warn(`warning: ${warning}`);
console.log(`plotdown-site: ${urls.length} pages, ${fixtures.length} examples, spec ${version}, in ${path.relative(root, out)} (${Date.now() - started} ms)`);

// ---------------------------------------------------------------- helpers

/**
 * Puts the fence lines of a Markdown block around highlighted JSON.
 * @param {string} html
 * @param {string} fence
 */
function withFence(html, fence) {
  return html
    .replace(/<pre class="shiki/, '<pre class="shiki fenced')
    .replace("<code>", `<code><span class="line fence">\`\`\`${fence}</span>\n`)
    .replace(/<\/code><\/pre>\s*$/, `\n<span class="line fence">\`\`\`</span></code></pre>`);
}

/** @param {string} markdown */
function plain(markdown) {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .trim();
}
