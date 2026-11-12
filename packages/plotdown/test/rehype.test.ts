import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import {unified} from "unified";
import {describe, expect, it} from "vitest";
import rehypePlotdown, {type RehypePlotdownOptions} from "../src/rehype.js";
import {BAD, BAR, dom, sampleMarkdown} from "./adapters.js";
import {createDocument} from "./helpers.js";

function processor(options?: RehypePlotdownOptions) {
  return unified().use(remarkParse).use(remarkRehype).use(rehypePlotdown, options).use(rehypeStringify);
}

describe("rehype", () => {
  it("puts every fence name in the tree as a chart and leaves other code alone", async () => {
    const file = await processor({document: createDocument()}).process(sampleMarkdown());
    const page = dom(String(file));
    expect(page.querySelectorAll("div.plotdown > svg")).toHaveLength(3);
    expect(page.querySelectorAll("div.plotdown rect").length).toBeGreaterThanOrEqual(6);
    // SVG attributes survive the trip through hast (viewBox, text-anchor, …)
    expect(page.querySelector("div.plotdown > svg")?.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);
    expect(page.querySelector("div.plotdown > svg [text-anchor]")).not.toBeNull();
    expect(page.querySelector("code.language-plot")?.textContent).toBe("plot sin(x) with lines\n");
    expect(page.querySelector("code.language-js")?.textContent).toBe("const a = 1 < 2;\n");
    expect(file.messages).toHaveLength(0);
  });

  it("creates a document from linkedom when the host gives none", async () => {
    const page = dom(String(await processor().process("```plot\n" + BAR + "\n```\n")));
    expect(page.querySelector("div.plotdown > svg")).not.toBeNull();
  });

  it("keeps a failing block as code with the reason under it, and warns on the file", async () => {
    const file = await processor().process("```plot\n" + BAD + "\n```\n");
    const page = dom(String(file));
    expect(page.querySelector(".plotdown-error code.language-json")?.textContent).toBe(BAD + "\n");
    expect(page.querySelector(".plotdown-message")?.textContent).toContain("$.marks[0].mark");
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]!.line).toBe(1);
  });

  it("fails the build in strict mode", async () => {
    await expect(processor({strict: true}).process("```plot\n" + BAD + "\n```\n")).rejects.toMatchObject({name: "PlotdownError", path: "$.marks[0].mark"});
  });

  it("leaves markup for plotdown.js in client mode", async () => {
    const page = dom(String(await processor({mode: "client"}).process("```oplot\n" + BAR + "\n```\n")));
    expect(page.querySelector("pre.plotdown > code.language-plot")?.textContent).toBe(BAR + "\n");
  });

  it("loads remote data when allowed", async () => {
    const fetch = async () => new Response("k,v\na,1\nb,2\nc,3\n", {status: 200});
    const md = '```plot\n{"data": {"d": {"url": "https://data.example.com/d.csv"}}, "marks": [{"mark": "barY", "data": "d", "x": "k", "y": "v"}]}\n```\n';
    const page = dom(String(await processor({allowRemote: true, fetch}).process(md)));
    expect(page.querySelectorAll("div.plotdown rect")).toHaveLength(3);
  });
});
