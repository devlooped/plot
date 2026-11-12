import {Marked} from "marked";
import {describe, expect, it} from "vitest";
import plotdown from "../src/marked.js";
import {PlotdownError} from "../src/errors.js";
import {BAD, BAR, dom, sampleMarkdown} from "./adapters.js";
import {createDocument} from "./helpers.js";

describe("marked", () => {
  it("renders every fence name as a chart and leaves other fences to marked", () => {
    const marked = new Marked(plotdown({document: createDocument()}));
    const page = dom(marked.parse(sampleMarkdown()) as string);
    expect(page.querySelectorAll("div.plotdown > svg")).toHaveLength(3);
    expect(page.querySelector("code.language-plot")?.textContent).toBe("plot sin(x) with lines\n");
    expect(page.querySelector("code.language-js")?.textContent).toBe("const a = 1 < 2;\n");
  });

  it("keeps indented code blocks as code", () => {
    const html = new Marked(plotdown()).parse("para\n\n    " + BAR.replace(/\n/g, "\n    ") + "\n") as string;
    expect(html).not.toContain("plotdown");
  });

  it("keeps a failing block as code with the reason under it, or throws in strict mode", () => {
    const page = dom(new Marked(plotdown()).parse("```plot\n" + BAD + "\n```\n") as string);
    expect(page.querySelector(".plotdown-error code.language-json")?.textContent).toBe(BAD);
    expect(page.querySelector(".plotdown-message")?.textContent).toContain("$.marks[0].mark");
    expect(() => new Marked(plotdown({strict: true})).parse("```plot\n" + BAD + "\n```\n")).toThrow(PlotdownError);
  });

  it("leaves markup for plotdown.js in client mode", () => {
    const page = dom(new Marked(plotdown({mode: "client"})).parse("```oplot\n" + BAR + "\n```\n") as string);
    expect(page.querySelector("pre.plotdown > code.language-plot")?.textContent).toBe(BAR);
  });

  it("loads remote data when allowed, as an async extension", async () => {
    const fetch = async (url: string) => new Response(url.endsWith("d.csv") ? "k,v\na,1\nb,2\n" : "", {status: 200});
    const marked = new Marked(plotdown({allowRemote: ["https://data.example.com"], fetch}));
    const md = '```plot\n{"data": {"d": {"url": "https://data.example.com/d.csv"}}, "marks": [{"mark": "barY", "data": "d", "x": "k", "y": "v"}]}\n```\n';
    const page = dom(await marked.parse(md));
    expect(page.querySelectorAll("div.plotdown rect")).toHaveLength(2);
  });
});
