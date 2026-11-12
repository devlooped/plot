import MarkdownIt from "markdown-it";
import {afterEach, describe, expect, it} from "vitest";
import {plotdownFences} from "../src/fences.js";
import {activate} from "../src/notebook-renderer.js";
import {clearRendered, remotePolicyOf, renderBlocks} from "../src/webview.js";

const BLOCK = '{"marks": [{"mark": "barY", "data": [{"a": "x", "b": 2}, {"a": "y", "b": 3}], "x": "a", "y": "b"}]}';
const BAD = '{"marks": [{"mark": "barY", "data": [], "x": "a", "bogus": 1}]}';
const fence = (info: string, code: string) => "```" + info + "\n" + code + "\n```\n";

function page(markdown: string, options = {}) {
  document.body.innerHTML = '<div class="markdown-body">' + new MarkdownIt({html: true}).use(plotdownFences, options).render(markdown) + "</div>";
  return document.querySelector(".markdown-body")!;
}

const charts = (root: ParentNode) => Array.from(root.querySelectorAll("plotdown-chart"));
const errors = (root: ParentNode) => Array.from(root.querySelectorAll("plotdown-error"));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderBlocks", () => {
  it("draws the blocks the plugin marked and hides their source", async () => {
    const root = page("# Title\n\n" + fence("plot", BLOCK) + fence("js", "let a;"));
    const result = await renderBlocks(root).done;
    expect(result).toEqual({rendered: 1, failed: 0, pending: 0});
    const [chart] = charts(root);
    expect(chart!.shadowRoot!.querySelector("svg")).not.toBeNull();
    expect(chart!.nextElementSibling!.getAttribute("data-plotdown")).toBe("rendered");
    expect((chart!.nextElementSibling as HTMLElement).style.display).toBe("none");
  });

  it("shows the reason and the JSON path under a block that fails", async () => {
    const root = page(fence("plot", BAD) + fence("oplot", '{"marks": [}'));
    const result = await renderBlocks(root).done;
    expect(result).toEqual({rendered: 0, failed: 2, pending: 0});
    const [first, second] = errors(root).map((e) => e.shadowRoot!.textContent);
    expect(first).toContain("$.marks[0].bogus");
    expect(second).toMatch(/line 1, column \d+/);
  });

  it("draws again after the preview updated in place, without duplicates", async () => {
    const root = page(fence("plot", BLOCK) + fence("plot", BAD));
    await renderBlocks(root).done;
    // What morphdom leaves of an unchanged block: the element, without what was added.
    for (const host of [...charts(root), ...errors(root)]) host.remove();
    for (const pre of Array.from(root.querySelectorAll("pre"))) pre.removeAttribute("style");
    const result = await renderBlocks(root).done;
    expect(result).toEqual({rendered: 1, failed: 1, pending: 0});
    expect(charts(root)).toHaveLength(1);
    expect(errors(root)).toHaveLength(1);
    // And when nothing was removed at all.
    await renderBlocks(root).done;
    expect(charts(root)).toHaveLength(1);
    expect(errors(root)).toHaveLength(1);
  });

  it("clears what it drew", async () => {
    const root = page(fence("plot", BLOCK));
    await renderBlocks(root).done;
    clearRendered(root);
    expect(charts(root)).toHaveLength(0);
    expect(root.querySelector("pre")!.hasAttribute("style")).toBe(false);
    expect(root.querySelector("pre")!.hasAttribute("data-plotdown")).toBe(false);
  });

  it("draws the block the host resolved, and shows the source as written", async () => {
    const remote = '{"data": {"a": {"url": "https://data.example/a.json"}}, "marks": [{"mark": "dot", "data": "a", "x": "x"}]}';
    const resolved = JSON.stringify({data: {a: [{x: 1}, {x: 2}]}, marks: [{mark: "dot", data: "a", x: "x"}]});
    const root = page(fence("plot", remote), {resolve: () => ({state: "ready", text: resolved}), allowRemote: () => true});
    expect(remotePolicyOf(root)).toBe(true);
    expect(await renderBlocks(root).done).toEqual({rendered: 1, failed: 0, pending: 0});
    expect(root.querySelector("pre code")!.textContent).toContain("https://data.example/a.json");
  });

  it("refuses a data URL the host did not load", async () => {
    const remote = '{"data": {"a": {"url": "https://data.example/a.json"}}, "marks": [{"mark": "dot", "data": "a", "x": "x"}]}';
    const root = page(fence("plot", remote));
    expect(remotePolicyOf(root)).toBe(false);
    expect(await renderBlocks(root).done).toEqual({rendered: 0, failed: 1, pending: 0});
    expect(errors(root)[0]!.shadowRoot!.textContent).toContain("allowRemote is false");
  });
});

describe("notebook renderer", () => {
  const item = (text: string) => ({id: "cell-1", mime: "application/vnd.plotdown+json", text: () => text, json: () => JSON.parse(text)});

  it("draws an output of the plotdown MIME type, given as an object or as a string", async () => {
    const renderer = (await activate({} as never)) as {renderOutputItem(item: unknown, element: HTMLElement): void};
    for (const text of [BLOCK, JSON.stringify(BLOCK)]) {
      const element = document.createElement("div");
      document.body.append(element);
      renderer.renderOutputItem(item(text), element);
      await new Promise((r) => setTimeout(r, 0));
      expect(element.querySelector("plotdown-chart")!.shadowRoot!.querySelector("svg")).not.toBeNull();
    }
  });

  it("shows the error of an output that is not a valid block", async () => {
    const renderer = (await activate({} as never)) as {renderOutputItem(item: unknown, element: HTMLElement): void};
    const element = document.createElement("div");
    document.body.append(element);
    renderer.renderOutputItem(item(BAD), element);
    await new Promise((r) => setTimeout(r, 0));
    expect(element.querySelector("plotdown-error")!.shadowRoot!.textContent).toContain("$.marks[0].bogus");
  });
});
