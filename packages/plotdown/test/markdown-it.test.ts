import MarkdownIt from "markdown-it";
import {describe, expect, it, vi} from "vitest";
import plotdown from "../src/markdown-it.js";
import {PlotdownError} from "../src/errors.js";
import {BAD, BAR, dom, sampleMarkdown} from "./adapters.js";
import {createDocument} from "./helpers.js";

describe("markdown-it", () => {
  it("renders every fence name as a chart and leaves other fences to the host", () => {
    const md = new MarkdownIt().use(plotdown, {document: createDocument()});
    const page = dom(md.render(sampleMarkdown()));
    expect(page.querySelectorAll("div.plotdown > svg")).toHaveLength(3);
    expect(page.querySelectorAll("div.plotdown rect").length).toBeGreaterThanOrEqual(6);
    // gnuplot in a plot fence and JavaScript stay markdown-it's code blocks
    expect(page.querySelector("code.language-plot")?.textContent).toBe("plot sin(x) with lines\n");
    expect(page.querySelector("code.language-js")?.textContent).toBe("const a = 1 < 2;\n");
  });

  it("creates a document from linkedom when the host gives none", () => {
    const md = new MarkdownIt().use(plotdown);
    expect(md.render("```plot\n" + BAR + "\n```\n")).toMatch(/^<div class="plotdown"><svg /);
  });

  it("keeps a failing block as code with the reason under it", () => {
    const onError = vi.fn();
    const md = new MarkdownIt().use(plotdown, {onError});
    const page = dom(md.render("```oplot\n" + BAD + "\n```\n\ntext after\n"));
    expect(page.querySelector(".plotdown-error pre code.language-json")?.textContent).toBe(BAD + "\n");
    expect(page.querySelector(".plotdown-error .plotdown-message")?.textContent).toMatch(/^plotdown: \$\.marks\[0\]\.mark: /);
    expect(page.querySelector("body > p")?.textContent).toBe("text after");
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(PlotdownError);
  });

  it("reports the line and column of a JSON syntax error", () => {
    const html = new MarkdownIt().use(plotdown).render("```plot\n{\n  \"marks\": [],\n}\n```\n");
    expect(dom(html).querySelector(".plotdown-message")?.textContent).toMatch(/\(line 3, column 1\)$/);
  });

  it("fails the build in strict mode", () => {
    const md = new MarkdownIt().use(plotdown, {strict: true});
    expect(() => md.render("```plot\n" + BAD + "\n```\n")).toThrow(PlotdownError);
  });

  it("leaves markup for plotdown.js in client mode", () => {
    const md = new MarkdownIt().use(plotdown, {mode: "client"});
    const page = dom(md.render("```observable-plot\n" + BAR + "\n```\n"));
    expect(page.querySelector("pre.plotdown > code.language-plot")?.textContent).toBe(BAR + "\n");
    expect(page.querySelector("svg")).toBeNull();
  });

  it("refuses remote data, since markdown-it cannot wait", () => {
    const md = new MarkdownIt().use(plotdown, {allowRemote: true});
    const html = md.render('```plot\n{"data": {"d": {"url": "https://example.com/d.csv"}}, "marks": [{"mark": "dot", "data": "d"}]}\n```\n');
    expect(dom(html).querySelector(".plotdown-message")).not.toBeNull();
  });
});
