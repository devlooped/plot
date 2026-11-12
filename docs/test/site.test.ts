// Checks the built site without a browser (the browser checks are in
// test/browser.mjs): the files at fixed paths, the links between pages, that no
// page loads anything from another origin, and the helpers of the playground.
// Builds the site first when docs/dist is missing.
import {execFileSync} from "node:child_process";
import {existsSync, readdirSync, readFileSync, statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {inflateSync, deflateSync} from "node:zlib";
import {beforeAll, describe, expect, it} from "vitest";
import {parsePath} from "../site/jsonpath.js";
import {decodeSpec, encodeSpec} from "../site/share.js";

const docs = fileURLToPath(new URL("..", import.meta.url));
const root = path.resolve(docs, "..");
const dist = path.join(docs, "dist");
const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n?/g, "\n");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

/** The file a site path is served from, or undefined. */
function served(pathname: string): string | undefined {
  const file = path.join(dist, decodeURIComponent(pathname));
  if (pathname.endsWith("/")) return existsSync(path.join(file, "index.html")) ? path.join(file, "index.html") : undefined;
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

let pages: string[] = [];

beforeAll(() => {
  if (!existsSync(path.join(dist, "index.html"))) execFileSync(process.execPath, [path.join(docs, "build/build.mjs")], {stdio: "inherit"});
  pages = files(dist).filter((file) => file.endsWith(".html"));
});

describe("files at fixed paths", () => {
  it("serves the schema at the path of its $id, with the version of the spec", () => {
    const version = /\*\*Spec version ([\d.]+)\*\*/.exec(read(path.join(root, "spec/spec.md")))?.[1];
    const file = path.join(dist, "schema", version!, "plot.schema.json");
    expect(read(file)).toBe(read(path.join(root, "spec/plot.schema.json")));
    expect(JSON.parse(read(file)).$id).toBe(`https://plotdown.cc/schema/${version}/plot.schema.json`);
  });

  it("serves llms.txt and llms-full.txt from docs/", () => {
    for (const name of ["llms.txt", "llms-full.txt"]) expect(read(path.join(dist, name))).toBe(read(path.join(docs, name)));
  });

  it("serves the current plotdown.js, which the pages load", () => {
    const built = path.join(root, "packages/plotdown/dist");
    for (const name of ["plotdown.js", "plotdown.iife.js"]) expect(readFileSync(path.join(dist, name)).equals(readFileSync(path.join(built, name)))).toBe(true);
    const home = read(path.join(dist, "index.html"));
    expect(home).toContain('<script type="module" src="/plotdown.js"></script>');
  });

  it("serves every fixture as an example", () => {
    const fixtures = readdirSync(path.join(root, "spec/fixtures")).filter((name) => name.endsWith(".json"));
    expect(fixtures.length).toBe(30);
    for (const name of fixtures) expect(JSON.parse(read(path.join(dist, "examples", name)))).toEqual(JSON.parse(read(path.join(root, "spec/fixtures", name))));
  });

  it("has a 404 page, a sitemap and robots.txt", () => {
    for (const name of ["404.html", "sitemap.xml", "robots.txt", "favicon.svg"]) expect(existsSync(path.join(dist, name))).toBe(true);
  });
});

describe("pages", () => {
  it("has a page for each recipe of docs/recipes", () => {
    const recipes = readdirSync(path.join(docs, "recipes")).filter((name) => name.endsWith(".md"));
    expect(recipes.length).toBeGreaterThan(0);
    for (const name of recipes) expect(served(`/recipes/${name.slice(0, -3)}/`), name).toBeDefined();
  });

  it("links only to pages and files that exist", () => {
    const broken: string[] = [];
    for (const page of pages) {
      const html = read(page);
      for (const match of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
        const url = match[1]!.replace(/&amp;/g, "&");
        if (!url.startsWith("/") || url.startsWith("//")) continue;
        const {pathname, searchParams} = new URL(url, "https://plotdown.cc");
        if (pathname === "/playground/" && searchParams.get("example")) {
          const example = searchParams.get("example")!;
          if (example !== "hero" && !served(`/examples/${example}.json`)) broken.push(`${path.relative(dist, page)}: ${url}`);
          continue;
        }
        if (!served(pathname)) broken.push(`${path.relative(dist, page)}: ${url}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("loads nothing from another origin", () => {
    const foreign: string[] = [];
    for (const page of pages) {
      const html = read(page);
      // What a page loads by itself: scripts, styles, images, fonts, frames.
      for (const match of html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*\s(?:src|href)="([^"]+)"/g)) {
        const [, tag, url] = match;
        if (tag === "link" && !/rel="(?:stylesheet|preload|icon|modulepreload)"/.test(match[0])) continue;
        if (/^(https?:)?\/\//.test(url!)) foreign.push(`${path.relative(dist, page)}: <${tag}> ${url}`);
      }
      for (const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|\sstyle="([^"]*)"/g)) {
        expect(style[1] ?? style[2], page).not.toMatch(/@import|url\(\s*["']?(https?:)?\/\//);
      }
    }
    expect(foreign).toEqual([]);
  });

  it("states that plotdown is not affiliated with Observable", () => {
    for (const page of pages) expect(read(page), page).toContain("not affiliated with Observable");
  });

  it("puts the plot blocks of Markdown pages in the markup plotdown.js finds", () => {
    const spec = read(path.join(dist, "spec/index.html"));
    expect(spec).toMatch(/<pre class="plotdown"><code class="language-plot">/);
    const gallery = read(path.join(dist, "gallery/index.html"));
    expect(gallery.match(/<code class="language-plot">/g)?.length).toBe(30);
  });

  it("has an inline chart in the hero, drawn at build time", () => {
    expect(read(path.join(dist, "index.html"))).toMatch(/<div class="plotdown hero-chart"><figure[^>]*>[\s\S]*<svg/);
  });

  it("has a slot for the image link of the playground", () => {
    expect(read(path.join(dist, "playground/index.html"))).toMatch(/<button[^>]*data-copy-image[^>]*disabled/);
  });
});

describe("playground helpers", () => {
  it("reads the JSON paths of PlotdownError", () => {
    expect(parsePath("$")).toEqual([]);
    expect(parsePath("$.marks[0].transform[1].binX.y")).toEqual(["marks", 0, "transform", 1, "binX", "y"]);
    expect(parsePath('$.data["my set"][3]["a\\"b"]')).toEqual(["data", "my set", 3, 'a"b']);
    expect(parsePath("marks")).toBeUndefined();
  });

  it("encodes a block as pako: (zlib, base64url), as the image service will read it", async () => {
    const text = '{"marks": [{"mark": "ruleY", "data": [0]}], "title": "Ünïcödé ✓"}';
    const token = await encodeSpec(text);
    expect(token).toMatch(/^pako:[\w-]+$/);
    expect(inflateSync(Buffer.from(token.slice(5), "base64url")).toString("utf8")).toBe(text);
    expect(await decodeSpec("pako:" + deflateSync(Buffer.from(text)).toString("base64url"))).toBe(text);
    expect(await decodeSpec(token)).toBe(text);
    await expect(decodeSpec("plain")).rejects.toThrow();
  });
});
