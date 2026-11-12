// node render.mjs <out-dir>: ../content.md to index.html (inline SVG) and client.html (for plotdown.js).
import fs from "node:fs";
import path from "node:path";
import MarkdownIt from "markdown-it";
import plotdown from "@devlooped/plotdown/markdown-it";

const out = process.argv[2] ?? ".";
const source = fs.readFileSync(new URL("../content.md", import.meta.url), "utf8");
const page = (body, head = "") => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>markdown-it</title>${head}</head><body>${body}</body></html>`;

const md = new MarkdownIt().use(plotdown, {onError: (error) => console.warn(`warning: ${error.path}: ${error.message}`)});
const client = new MarkdownIt().use(plotdown, {mode: "client"});

fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, "index.html"), page(md.render(source)));
fs.writeFileSync(path.join(out, "client.html"), page(client.render(source), '<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>'));
console.log(`wrote ${out}/index.html and client.html`);
