import MarkdownIt from "markdown-it";
import {describe, expect, it} from "vitest";
import {plotdownFences, type FencesOptions} from "../src/fences.js";

const BLOCK = '{"marks": [{"mark": "dot", "data": [{"x": 1, "y": 2}], "x": "x", "y": "y"}]}';
const fence = (info: string, code: string) => "```" + info + "\n" + code + "\n```\n";

function md(options?: FencesOptions) {
  return new MarkdownIt({html: true}).use(plotdownFences, options);
}

describe("plotdownFences", () => {
  it("marks plot, oplot and observable-plot fences for the webview", () => {
    for (const name of ["plot", "oplot", "observable-plot", "PLOT {.wide}"]) {
      const html = md().render(fence(name, BLOCK));
      expect(html).toContain('<pre class="plotdown"><code class="language-plot">');
      expect(html).toContain("{&quot;marks&quot;");
    }
  });

  it("leaves other fences and gnuplot scripts to the host", () => {
    const plain = new MarkdownIt();
    for (const source of [fence("js", "let a = 1;"), fence("plot", "plot sin(x)"), fence("", "text")]) {
      expect(md().render(source)).toBe(plain.render(source));
    }
    // oplot is always a plot block, even when it is not JSON: the webview shows why.
    expect(md().render(fence("oplot", "nope"))).toContain('class="plotdown"');
  });

  it("keeps the token's attributes (VS Code's data-line) without changing the token", () => {
    const it = md();
    it.core.ruler.push("lines", (state) => {
      for (const token of state.tokens) if (token.map && token.type === "fence") {
        token.attrJoin("class", "code-line");
        token.attrSet("data-line", String(token.map[0]));
      }
    });
    const tokens = it.parse(fence("plot", BLOCK), {});
    const first = it.renderer.render(tokens, it.options, {});
    const second = it.renderer.render(tokens, it.options, {});
    expect(first).toContain('<pre class="plotdown code-line" data-line="0">');
    expect(second).toBe(first);
  });

  it("writes the remote policy and the resolved block", () => {
    const html = md({
      allowRemote: () => ["https://a.example", "https://b.example"],
      resolve: () => ({state: "ready", text: '{"marks":[]}'})
    }).render(fence("plot", BLOCK));
    expect(html).toContain('data-plotdown-resolved="{&quot;marks&quot;:[]}"');
    expect(html).toContain('data-plotdown-remote="https://a.example https://b.example"');
    expect(md({allowRemote: () => true}).render(fence("plot", BLOCK))).toContain('data-plotdown-remote="true"');
    expect(md({allowRemote: () => false}).render(fence("plot", BLOCK))).not.toContain("data-plotdown-remote");
  });

  it("shows a note while the data loads, and the reason when it fails", () => {
    const pending = md({resolve: () => ({state: "pending"})}).render(fence("plot", BLOCK));
    expect(pending).toContain('<pre class="plotdown-pending"><code class="language-json">');
    expect(pending).toContain("loading the data");
    const failed = md({resolve: () => ({state: "error", message: 'could not load "x": HTTP 404 at $.data.a.url'})}).render(fence("plot", BLOCK));
    expect(failed).toContain('<pre class="plotdown-failed"><code class="language-json">');
    expect(failed).toContain("plotdown: could not load &quot;x&quot;: HTTP 404 at $.data.a.url");
  });
});
