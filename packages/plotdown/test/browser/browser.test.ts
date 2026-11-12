import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {JSDOM} from "jsdom";
import {afterEach, describe, expect, it} from "vitest";
import {readScriptOptions} from "../../src/browser/auto.js";
import {BlockRenderer, CHART_TAG, detectScheme, ERROR_TAG, findBlocks, SELECTORS, STATE_ATTRIBUTE, VIEW_ATTRIBUTE, type BlockSelector} from "../../src/browser/index.js";
import {isPlotSpec} from "../../src/fences.js";

const samplesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "samples");
const sample = (name: string) => fs.readFileSync(path.join(samplesDir, name), "utf8");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const renderers: BlockRenderer[] = [];
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.disconnect();
});

function page(body: string, attributes = ""): Document {
  return new JSDOM(`<!DOCTYPE html><html ${attributes}><head></head><body>${body}</body></html>`).window.document;
}

function renderer(options: ConstructorParameters<typeof BlockRenderer>[0] = {}): BlockRenderer {
  const r = new BlockRenderer(options);
  renderers.push(r);
  return r;
}

const charts = (document: Document) => Array.from(document.querySelectorAll<HTMLElement>(CHART_TAG));
const errors = (document: Document) => Array.from(document.querySelectorAll<HTMLElement>(ERROR_TAG));
const SPEC = '{"marks": [{"mark": "dot", "data": [1, 2, 3], "x": [1, 2, 3]}]}';

/**
 * Each sample of real markup, the selector entries that must find its plot blocks, and the blocks it must leave
 * alone (a block of ambiguous markup that holds JSON but not a plot spec is left alone too, not left pending).
 */
const SAMPLES: {file: string; found: string[]; ignored: number}[] = [
  {file: "github.html", found: ["pre-lang", "pre-lang", "github"], ignored: 1},
  {file: "github-live.html", found: ["pre-lang", "github"], ignored: 3},
  {file: "gitlab.html", found: ["gitlab", "gitlab"], ignored: 2},
  {file: "gitea.html", found: ["gitea", "gitea"], ignored: 1},
  {file: "forgejo.html", found: ["markdown", "markdown"], ignored: 2},
  {file: "bitbucket.html", found: ["bitbucket", "bitbucket"], ignored: 3},
  {file: "azure-devops.html", found: ["azure-devops", "azure-devops"], ignored: 2},
  {file: "chatgpt.html", found: ["chatgpt", "chatgpt"], ignored: 1},
  {file: "claude.html", found: ["claude", "claude-observable"], ignored: 1},
  {file: "gemini.html", found: ["gemini", "gemini"], ignored: 1},
  {file: "markdown-it.html", found: ["markdown", "markdown"], ignored: 1},
  {file: "pandoc.html", found: ["pre-class", "pre-class"], ignored: 0},
  {file: "fallback.html", found: ["fallback", "fallback"], ignored: 1}
];

describe("selectors", () => {
  for (const {file, found} of SAMPLES) {
    it(`find the blocks of ${file}`, () => {
      const document = page(sample(file));
      const blocks = findBlocks(document);
      // A block of ambiguous markup (GitHub's gnuplot, Bitbucket, Gemini…) is a candidate; only a plot spec renders.
      const names = blocks.filter((b) => !(b.selector.ambiguous && !isPlotSpec(b.text))).map((b) => b.selector.name);
      expect(names.sort()).toEqual([...found].sort());
      for (const block of blocks) expect(block.text).not.toContain("<span");
    });
  }

  it("read GitLab's lines and GitHub's highlighted text as the source", () => {
    const gitlab = findBlocks(page(sample("gitlab.html")));
    expect(JSON.parse(gitlab[0]!.text).marks[0].mark).toBe("lineY");
    expect(gitlab[0]!.block.classList.contains("markdown-code-block")).toBe(true);
    const github = findBlocks(page(sample("github-live.html")));
    expect(github.map((b) => b.block.className.split(" ")[0])).toEqual(["snippet-clipboard-content", "highlight", "highlight"]);
  });

  it("take each site's whole block, its header and copy button with the code", () => {
    const blocks = (file: string) => findBlocks(page(sample(file))).filter((b) => !b.selector.ambiguous || isPlotSpec(b.text));
    const chatgpt = blocks("chatgpt.html");
    expect(chatgpt.map((b) => b.block.firstElementChild!.nextElementSibling!.textContent)).toEqual(["plot", "observable-plot"]);
    expect(chatgpt.every((b) => b.block.lastElementChild!.localName === "pre")).toBe(true);
    expect(blocks("claude.html").map((b) => b.block.getAttribute("aria-label"))).toEqual(["plot code", "observable code"]);
    const gemini = blocks("gemini.html");
    expect(gemini.map((b) => b.block.localName)).toEqual(["code-block", "code-block"]);
    expect(JSON.parse(gemini[0]!.text).title).toBe("Demo");
    expect(blocks("gitea.html").map((b) => b.block.className)).toEqual(["code-block-container code-overflow-scroll", "code-block-container code-overflow-scroll"]);
    expect(blocks("azure-devops.html").map((b) => b.block.className)).toEqual(["copy-btn-container", "copy-btn-container"]);
    expect(blocks("bitbucket.html").map((b) => b.block.className)).toEqual(["codehilite", "codehilite"]);
    // Forgejo's copy button is inside the <pre>: the source is the <code> alone.
    const forgejo = blocks("forgejo.html");
    expect(forgejo.map((b) => b.block.localName)).toEqual(["pre", "pre"]);
    for (const b of forgejo) expect(isPlotSpec(b.text)).toBe(true);
  });

  it("skip a broken entry and editors", () => {
    const broken: BlockSelector = {name: "broken", selector: "pre:::nonsense", fence: () => "plot"};
    const throwing: BlockSelector = {name: "throwing", selector: "pre", fence: () => { throw new Error("boom"); }};
    const document = page(`<pre><code class="language-plot">${SPEC}</code></pre><div contenteditable="true"><pre><code class="language-plot">${SPEC}</code></pre></div>`);
    expect(findBlocks(document, [broken, throwing, ...SELECTORS]).map((b) => b.selector.name)).toEqual(["markdown"]);
  });
});

describe("renderer", () => {
  for (const {file, found, ignored} of SAMPLES) {
    it(`renders ${file} and leaves other code alone`, async () => {
      const document = page(sample(file));
      const before = document.querySelectorAll("pre").length;
      const result = await renderer().scan(document, true);
      expect(result).toEqual({rendered: found.length, failed: 0, pending: 0});
      expect(charts(document)).toHaveLength(found.length);
      expect(errors(document)).toHaveLength(0);
      for (const chart of charts(document)) {
        expect(chart.shadowRoot!.querySelector(".chart svg")).not.toBeNull();
        // Plot's <style> moved to a constructed sheet: nothing for a page's CSP to block.
        expect(chart.shadowRoot!.querySelector("style")).toBeNull();
        expect(chart.shadowRoot!.adoptedStyleSheets.length).toBeGreaterThan(1);
        const block = chart.nextElementSibling as HTMLElement;
        expect(block.getAttribute(STATE_ATTRIBUTE)).toBe("rendered");
        expect(block.style.getPropertyValue("display")).toBe("none");
      }
      const untouched = Array.from(document.querySelectorAll("pre")).filter((pre) => !pre.closest(`[${STATE_ATTRIBUTE}]`));
      expect(untouched).toHaveLength(ignored);
      expect(document.querySelectorAll("pre")).toHaveLength(before);
    });
  }

  it("keeps a real gnuplot script on GitHub as code, with no error", async () => {
    const document = page(sample("github.html"));
    await renderer().scan(document, true);
    const gnuplot = Array.from(document.querySelectorAll("div.highlight-source-gnuplot")).find((d) => d.textContent!.includes("set terminal"))!;
    expect(gnuplot.hasAttribute(STATE_ATTRIBUTE)).toBe(false);
    expect((gnuplot as HTMLElement).style.display).toBe("");
    expect(errors(document)).toHaveLength(0);
  });

  it("never renders a block twice: scanned again, or by a second instance", async () => {
    const document = page(sample("markdown-it.html"));
    await renderer().scan(document, true);
    await renderer().scan(document, true);
    const r = renderer();
    await r.scan(document, true);
    await r.scan(document, true);
    expect(charts(document)).toHaveLength(2);
  });

  it("shows the error under a block that fails, and keeps the block as code", async () => {
    const document = page(`<pre><code class="language-plot">{"marks": [{"mark": "bogus", "data": [1]}]}</code></pre>`);
    const result = await renderer().scan(document, true);
    expect(result.failed).toBe(1);
    const [error] = errors(document);
    expect(error!.previousElementSibling!.localName).toBe("pre");
    expect(error!.shadowRoot!.textContent).toMatch(/bogus/);
    expect(error!.shadowRoot!.querySelector("code")!.textContent).toBe("$.marks[0].mark");
    expect(charts(document)).toHaveLength(0);
    expect((document.querySelector("pre") as HTMLElement).style.display).toBe("");
  });

  it("refuses remote data unless the host allows it", async () => {
    const document = page(`<pre><code class="language-plot">{"marks": [{"mark": "dot", "data": {"url": "https://example.com/a.csv"}, "x": "a"}]}</code></pre>`);
    let fetched = false;
    await renderer({fetch: async () => { fetched = true; return new Response("a\n1\n"); }}).scan(document, true);
    expect(fetched).toBe(false);
    expect(errors(document)[0]!.shadowRoot!.textContent).toMatch(/\$\.marks\[0\]\.data/);
  });

  it("loads remote data from an allowed origin", async () => {
    const document = page(`<pre><code class="language-plot">{"marks": [{"mark": "dot", "data": {"url": "https://example.com/a.csv"}, "x": "a"}]}</code></pre>`);
    const result = await renderer({allowRemote: ["https://example.com"], fetch: async () => new Response("a\n1\n2\n")}).scan(document, true);
    expect(result.rendered).toBe(1);
  });

  it("switches between the chart and its source", async () => {
    const document = page(sample("pandoc.html"));
    await renderer().scan(document, true);
    const chart = charts(document)[0]!;
    const block = chart.nextElementSibling as HTMLElement;
    const button = chart.shadowRoot!.querySelector<HTMLButtonElement>("button[aria-pressed]")!;
    expect(chart.getAttribute(VIEW_ATTRIBUTE)).toBe("chart");
    button.click();
    expect(block.style.display).toBe("");
    expect(chart.shadowRoot!.querySelector<HTMLElement>(".chart")!.hidden).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(chart.getAttribute(VIEW_ATTRIBUTE)).toBe("source");
    button.click();
    expect(block.style.getPropertyValue("display")).toBe("none");
    expect(chart.shadowRoot!.querySelector<HTMLElement>(".chart")!.hidden).toBe(false);
    expect(chart.getAttribute(VIEW_ATTRIBUTE)).toBe("chart");
    const plain = page(sample("pandoc.html"));
    await renderer({toggle: false, copy: false}).scan(plain, true);
    expect(charts(plain)[0]!.shadowRoot!.querySelector("button")).toBeNull();
    expect(charts(plain)[0]!.shadowRoot!.querySelector(".toolbar")).toBeNull();
  });

  it("copies the block as JSON and the chart as SVG from the Copy menu", async () => {
    const document = page(`<pre><code class="language-plot">{"title": "Dots", "marks": [{"mark": "dot", "data": [1, 2, 3], "x": [1, 2, 3]}]}</code></pre>`);
    const written: string[] = [];
    Object.defineProperty(document.defaultView!.navigator, "clipboard", {configurable: true, value: {writeText: async (text: string) => void written.push(text)}});
    await renderer({toggle: false}).scan(document, true);
    const shadow = charts(document)[0]!.shadowRoot!;
    const button = shadow.querySelector<HTMLButtonElement>(".copy > button")!;
    const menu = shadow.querySelector<HTMLElement>("[role=menu]")!;
    expect(menu.hidden).toBe(true);
    button.click();
    expect(menu.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
    expect(items.map((item) => item.textContent)).toEqual(["JSON", "PNG", "SVG"]);
    items[0]!.click();
    expect(menu.hidden).toBe(true);
    button.click();
    items[2]!.click();
    await wait(0);
    expect(JSON.parse(written[0]!).title).toBe("Dots");
    expect(written[1]).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>.*Dots.*<\/svg>\n$/s);
    expect(button.getAttribute("data-state")).toBe("done");
    // A click outside closes the menu.
    button.click();
    document.body.dispatchEvent(new document.defaultView!.Event("pointerdown", {bubbles: true, composed: true}));
    expect(menu.hidden).toBe(true);
  });

  it("follows the page's color scheme", async () => {
    expect(detectScheme(page(`<p id="p">x</p>`, `data-color-mode="dark"`).getElementById("p")!)).toBe("dark");
    expect(detectScheme(page(`<p id="p">x</p>`, `data-color-mode="light"`).getElementById("p")!)).toBe("light");
    expect(detectScheme(page(`<div style="background-color: rgb(13, 17, 23)"><p id="p">x</p></div>`).getElementById("p")!)).toBe("dark");
    expect(detectScheme(page(`<div style="color-scheme: dark"><p id="p">x</p></div>`).getElementById("p")!)).toBe("dark");
    expect(detectScheme(page(`<div style="color: rgb(240, 240, 240)"><p id="p">x</p></div>`).getElementById("p")!)).toBe("dark");
    expect(detectScheme(page(`<p id="p">x</p>`).getElementById("p")!)).toBe("light");

    const document = page(`<div style="background-color: rgb(13, 17, 23)">${sample("pandoc.html")}</div>`);
    await renderer().scan(document, true);
    const chart = charts(document)[0]!;
    expect(chart.getAttribute("data-scheme")).toBe("dark");
    expect(chart.style.getPropertyValue("--plotdown-background")).toBe("rgb(13, 17, 23)");
    const forced = page(sample("pandoc.html"));
    await renderer({theme: "dark"}).scan(forced, true);
    expect(charts(forced)[0]!.hasAttribute("data-forced")).toBe(true);
  });
});

describe("watching", () => {
  it("renders blocks added later", async () => {
    const document = page(`<main></main>`);
    const r = renderer();
    r.observe(document);
    await r.scan(document);
    document.querySelector("main")!.insertAdjacentHTML("beforeend", sample("markdown-it.html"));
    await wait(150);
    expect(charts(document)).toHaveLength(2);
  });

  it("renders a streamed block once, when its JSON is complete, with no error on the way", async () => {
    const document = page(`<main></main>`);
    const r = renderer({settle: 200});
    r.observe(document);
    await r.scan(document);
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "language-plot";
    pre.append(code);
    document.querySelector("main")!.append(pre);
    const text = '{"title": "Streamed", "marks": [{"mark": "barY", "data": [{"a": "x", "b": 1}, {"a": "y", "b": 3}], "x": "a", "y": "b"}]}';
    const seen = {errors: 0, charts: new Set<Element>()};
    const watch = new document.defaultView!.MutationObserver(() => {
      seen.errors += errors(document).length;
      for (const chart of charts(document)) seen.charts.add(chart);
    });
    watch.observe(document.body, {childList: true, subtree: true});
    for (let i = 0; i < text.length; i += 7) {
      // Chat UIs both append text nodes and grow an existing one.
      if (i % 2) code.append(text.slice(i, i + 7));
      else code.lastChild && code.lastChild.nodeType === 3 ? ((code.lastChild as Text).data += text.slice(i, i + 7)) : code.append(text.slice(i, i + 7));
      await wait(i < 50 ? 60 : 5);
      if (i + 7 < text.length) expect(charts(document)).toHaveLength(0);
    }
    await wait(150);
    watch.disconnect();
    expect(charts(document)).toHaveLength(1);
    expect(seen.charts.size).toBe(1);
    expect(seen.errors).toBe(0);
    expect(errors(document)).toHaveLength(0);
    expect(charts(document)[0]!.shadowRoot!.querySelector("h2")!.textContent).toBe("Streamed");
  });

  for (const start of ["", "{"]) {
    it(`renders a streamed block of ambiguous markup (Gemini) that starts with ${JSON.stringify(start)}`, async () => {
      const document = page(`<main></main>`);
      const r = renderer({settle: 200});
      r.observe(document);
      await r.scan(document);
      document.querySelector("main")!.insertAdjacentHTML(
        "beforeend",
        `<code-block><div class="code-block"><div class="code-block-decoration"><span>Code snippet</span></div><pre><code role="text" data-test-id="code-content" class="code-container formatted">${start}</code></pre></div></code-block>`
      );
      const code = document.querySelector("code")!;
      // The renderer sees the block as it was added before the first token comes.
      await wait(120);
      const text = '{"title": "Streamed", "marks": [{"mark": "barY", "data": [{"a": "x", "b": 1}, {"a": "y", "b": 3}], "x": "a", "y": "b"}]}'.slice(start.length);
      for (let i = 0; i < text.length; i += 9) {
        code.append(text.slice(i, i + 9));
        await wait(i < 40 ? 70 : 5);
      }
      await wait(150);
      expect(errors(document)).toHaveLength(0);
      expect(charts(document)).toHaveLength(1);
      expect(charts(document)[0]!.nextElementSibling!.localName).toBe("code-block");
    });
  }

  it("lets go of an empty block of ambiguous markup once its text is another language", async () => {
    const document = page(`<main></main>`);
    const r = renderer({settle: 50});
    r.observe(document);
    await r.scan(document);
    document.querySelector("main")!.insertAdjacentHTML("beforeend", `<code-block><pre><code data-test-id="code-content"></code></pre></code-block>`);
    await wait(120);
    expect(document.querySelector("code-block")!.getAttribute(STATE_ATTRIBUTE)).toBe("pending");
    document.querySelector("code")!.append('print("hello")');
    await wait(200);
    expect(document.querySelector("code-block")!.hasAttribute(STATE_ATTRIBUTE)).toBe(false);
    expect(charts(document)).toHaveLength(0);
    expect(errors(document)).toHaveLength(0);
  });

  it("leaves a whole JSON object that is not a plot spec alone in ambiguous markup, streamed or not", async () => {
    const document = page(`<main><div class="codehilite"><pre><span></span>{"name": "plotdown", "private": true}</pre></div></main>`);
    const r = renderer({settle: 50});
    r.observe(document);
    expect(await r.scan(document)).toEqual({rendered: 0, failed: 0, pending: 0});
    expect(document.querySelector(".codehilite")!.hasAttribute(STATE_ATTRIBUTE)).toBe(false);
    // Streamed (Gemini): pending while the object is open, let go once it closes without marks.
    document.querySelector("main")!.insertAdjacentHTML("beforeend", `<code-block><pre><code data-test-id="code-content">{"a": </code></pre></code-block>`);
    await wait(120);
    expect(document.querySelector("code-block")!.getAttribute(STATE_ATTRIBUTE)).toBe("pending");
    document.querySelector("code-block code")!.append("[1, 2]}");
    await wait(200);
    expect(document.querySelector("code-block")!.hasAttribute(STATE_ATTRIBUTE)).toBe(false);
    expect(charts(document)).toHaveLength(0);
    expect(errors(document)).toHaveLength(0);
  });

  it("shows a syntax error only once the text settles, and drops it when the text changes", async () => {
    const document = page(`<pre><code class="language-plot">{"marks": [], "x": {},}</code></pre>`);
    const r = renderer({settle: 80});
    r.observe(document);
    await r.scan(document);
    expect(errors(document)).toHaveLength(0);
    await wait(150);
    expect(errors(document)).toHaveLength(1);
    expect(errors(document)[0]!.shadowRoot!.textContent).toMatch(/line 1, column/);
    document.querySelector("code")!.textContent = SPEC;
    await wait(150);
    expect(errors(document)).toHaveLength(0);
    expect(charts(document)).toHaveLength(1);
  });

  it("leaves a plot fence that holds gnuplot alone, even when it never parses", async () => {
    const document = page(`<pre><code class="language-plot">set terminal png\nplot sin(x)</code></pre>`);
    const r = renderer({settle: 20});
    r.observe(document);
    await r.scan(document);
    await wait(100);
    expect(errors(document)).toHaveLength(0);
    expect(charts(document)).toHaveLength(0);
  });

  it("re-renders a block whose text changes in place, keeping one chart", async () => {
    const document = page(`<pre><code class="language-plot">${SPEC}</code></pre>`);
    const r = renderer();
    r.observe(document);
    await r.scan(document);
    const first = charts(document)[0];
    document.querySelector("code")!.textContent = SPEC.replace("[1, 2, 3]}", "[1, 2, 3], \"r\": 5}");
    await wait(150);
    expect(charts(document)).toHaveLength(1);
    expect(charts(document)[0]).not.toBe(first);
  });

  it("removes the chart with its block, and puts back a chart the page removed", async () => {
    const document = page(`<main>${sample("markdown-it.html")}</main>`);
    const r = renderer();
    r.observe(document);
    await r.scan(document);
    charts(document)[0]!.remove();
    await wait(150);
    expect(charts(document)).toHaveLength(2);
    document.querySelector("main")!.innerHTML = "";
    await wait(150);
    expect(charts(document)).toHaveLength(0);
  });

  it("releases waiting blocks when it stops", async () => {
    const document = page(`<pre><code class="language-plot">{"marks": [</code></pre>`);
    const r = renderer();
    r.observe(document);
    await r.scan(document);
    expect(document.querySelector("pre")!.getAttribute(STATE_ATTRIBUTE)).toBe("pending");
    r.disconnect();
    expect(document.querySelector("pre")!.hasAttribute(STATE_ATTRIBUTE)).toBe(false);
  });
});

describe("script tag", () => {
  it("reads its options from data attributes", () => {
    const document = page(`<script data-auto="false" data-allow-remote="https://a.example https://b.example" data-theme="dark" data-toggle="no" data-copy="false" data-settle="false"></script><script data-allow-remote></script>`);
    const [first, second] = Array.from(document.querySelectorAll("script"));
    expect(readScriptOptions(first!)).toEqual({auto: false, allowRemote: ["https://a.example", "https://b.example"], theme: "dark", toggle: false, copy: false, settle: false});
    expect(readScriptOptions(second!)).toEqual({allowRemote: true});
    expect(readScriptOptions(null)).toEqual({});
  });
});
