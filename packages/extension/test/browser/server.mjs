// The local pages of the browser tests, served under a strict policy (no
// inline style or script), so that charts must keep their styles without
// <style> elements the page would refuse.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.resolve(here, "../../../plotdown/test/browser/samples");

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:";

const GNUPLOT = `<div class="highlight highlight-source-gnuplot notranslate position-relative overflow-auto" dir="auto"><pre><span class="pl-k">set</span> terminal png
<span class="pl-k">plot</span> sin(x) <span class="pl-k">with</span> lines</pre></div>`;
const PLOT = JSON.stringify({marks: [{mark: "barY", data: [{a: "x", b: 1}, {a: "y", b: 3}, {a: "z", b: 2}], x: "a", y: "b", fill: "a"}]});

const pages = {
  // GitHub's markup (samples of plotdown.js's tests): plot, oplot, observable-plot and a real gnuplot block.
  "/github": () => fs.readFileSync(path.join(samplesDir, "github-live.html"), "utf8") + fs.readFileSync(path.join(samplesDir, "github.html"), "utf8"),
  "/gnuplot": () => `<article class="markdown-body">${GNUPLOT}<pre><code class="language-js">let plot = 1;</code></pre></article>`,
  "/empty": () => "<main><h1>Nothing to see</h1><p>No plot block here.</p></main>",
  // A block added after load, as a page that loads content on scroll does.
  "/late": () => `<main><p>Loading…</p></main><script src="/late.js"></script>`,
  // A chat answer: an empty block, then its text token by token.
  "/stream": () => `<main></main><script src="/stream.js"></script>`
};

const scripts = {
  "/late.js": `setTimeout(() => { document.querySelector("main").insertAdjacentHTML("beforeend", ${JSON.stringify(`<pre><code class="language-plot">${PLOT}</code></pre>`)}); }, 1500);`,
  "/stream.js": `setTimeout(async () => {
    const main = document.querySelector("main");
    main.insertAdjacentHTML("beforeend", "<div class='message'><p>Here:</p><pre><code class='language-observable-plot'></code></pre></div>");
    const code = main.querySelector("code");
    for (const token of ${JSON.stringify(PLOT)}.match(/.{1,5}/gs)) { code.append(token); await new Promise((r) => setTimeout(r, 10)); }
  }, 1000);`
};

/** Starts the server on a free port of 127.0.0.1. */
export async function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const headers = {"Content-Security-Policy": CSP, "Cache-Control": "no-store"};
    if (pages[url.pathname]) {
      response.writeHead(200, {...headers, "Content-Type": "text/html; charset=utf-8"});
      response.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${url.pathname}</title></head><body>${pages[url.pathname]()}</body></html>`);
    } else if (scripts[url.pathname]) {
      response.writeHead(200, {...headers, "Content-Type": "text/javascript"});
      response.end(scripts[url.pathname]);
    } else response.writeHead(404, headers).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close()};
}
