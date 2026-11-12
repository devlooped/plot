import {readFileSync} from "node:fs";
import path from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {hasCandidate, watchForBlocks} from "../src/detector.js";

// The samples of plotdown.js's own browser tests: the markup of each host.
// (Paths from the package folder: under jsdom, import.meta.url is not a file URL.)
const sample = (name: string) => readFileSync(path.resolve("../plotdown/test/browser/samples", name), "utf8");

const GNUPLOT_ONLY = `<article class="markdown-body">
<div class="highlight highlight-source-gnuplot notranslate position-relative overflow-auto" dir="auto"><pre><span class="pl-k">set</span> terminal png
<span class="pl-k">plot</span> sin(x) <span class="pl-k">with</span> lines</pre></div>
<div class="highlight highlight-source-shell"><pre>echo hi</pre></div>
</article>`;

const page = (html: string) => {
  document.body.innerHTML = html;
  return document;
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("hasCandidate", () => {
  it.each(["github.html", "github-live.html", "gitlab.html", "markdown-it.html", "pandoc.html", "fallback.html"])("finds the blocks of %s", (name) => {
    expect(hasCandidate(page(sample(name)))).toBe(true);
  });

  it("finds oplot and observable-plot blocks as GitHub writes them", () => {
    for (const lang of ["oplot", "observable-plot"]) {
      expect(hasCandidate(page(`<div class="snippet-clipboard-content"><pre lang="${lang}"><code>{"marks": []}</code></pre></div>`))).toBe(true);
    }
  });

  it("ignores a real gnuplot block, which GitHub marks up as a plot block", () => {
    expect(hasCandidate(page(GNUPLOT_ONLY))).toBe(false);
  });

  it("ignores a page without a block", () => {
    expect(hasCandidate(page("<main><pre><code class='language-js'>let x = 1;</code></pre><p>plot</p></main>"))).toBe(false);
  });

  it("takes a block that is still empty (a chat answer about to stream in)", () => {
    expect(hasCandidate(page("<pre><code class='language-plot'></code></pre>"))).toBe(true);
  });

  it("ignores a block being edited", () => {
    expect(hasCandidate(page("<div contenteditable='true'><pre><code class='language-plot'>{}</code></pre></div>"))).toBe(false);
  });

  it("ignores blocks another copy of plotdown.js has claimed", () => {
    expect(hasCandidate(page("<pre data-plotdown='rendered'><code class='language-plot'>{}</code></pre>"))).toBe(false);
  });
});

describe("watchForBlocks", () => {
  it("calls back at once when the page has a block", () => {
    const onFound = vi.fn();
    watchForBlocks(page(sample("github.html")), onFound);
    expect(onFound).toHaveBeenCalledTimes(1);
  });

  it("calls back once when a block arrives later, and not before", async () => {
    vi.useFakeTimers();
    const document = page("<main></main>");
    const onFound = vi.fn();
    watchForBlocks(document, onFound, {delay: 10});
    document.querySelector("main")!.insertAdjacentHTML("beforeend", "<p>Hello</p><pre><code class='language-js'>1</code></pre>");
    await vi.advanceTimersByTimeAsync(50);
    expect(onFound).not.toHaveBeenCalled();
    document.querySelector("main")!.insertAdjacentHTML("beforeend", "<div class='message'><pre><code class='language-oplot'>{</code></pre></div>");
    document.querySelector("main")!.insertAdjacentHTML("beforeend", "<pre><code class='language-plot'></code></pre>");
    await vi.advanceTimersByTimeAsync(50);
    expect(onFound).toHaveBeenCalledTimes(1);
  });

  it("notices an element that becomes a block when its class changes", async () => {
    vi.useFakeTimers();
    const document = page("<pre><code id='c'>{}</code></pre>");
    const onFound = vi.fn();
    watchForBlocks(document, onFound, {delay: 10});
    document.getElementById("c")!.className = "language-plot";
    await vi.advanceTimersByTimeAsync(50);
    expect(onFound).toHaveBeenCalledTimes(1);
  });

  it("never calls back for a page that only adds other content or gnuplot", async () => {
    vi.useFakeTimers();
    const document = page("<main></main>");
    const onFound = vi.fn();
    watchForBlocks(document, onFound, {delay: 10});
    for (let i = 0; i < 5; i++) {
      document.querySelector("main")!.insertAdjacentHTML("beforeend", GNUPLOT_ONLY);
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(onFound).not.toHaveBeenCalled();
  });

  it("stops watching when asked", async () => {
    vi.useFakeTimers();
    const document = page("<main></main>");
    const onFound = vi.fn();
    const stop = watchForBlocks(document, onFound, {delay: 10});
    stop();
    document.querySelector("main")!.insertAdjacentHTML("beforeend", "<pre><code class='language-plot'>{}</code></pre>");
    await vi.advanceTimersByTimeAsync(50);
    expect(onFound).not.toHaveBeenCalled();
  });
});
