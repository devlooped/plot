import {describe, expect, it} from "vitest";
import {PlotdownError, render, renderAsync, resolveRemoteData, validate, type PlotSpec} from "../src/index.js";
import {sanitize} from "../src/sanitize.js";
import {createDocument} from "./helpers.js";

/** Runs fn and returns the PlotdownError it throws. */
function error(fn: () => unknown): PlotdownError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PlotdownError);
    return e as PlotdownError;
  }
  throw new Error("expected a PlotdownError");
}

async function rejection(promise: Promise<unknown>): Promise<PlotdownError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(PlotdownError);
    return e as PlotdownError;
  }
  throw new Error("expected a PlotdownError");
}

const dot = (options: Record<string, unknown>): PlotSpec => ({marks: [{mark: "dot", data: [{a: 1, b: 2}], x: "a", y: "b", ...options}]});

describe("function-like strings", () => {
  it("are rejected in a channel", () => {
    const e = error(() => validate(dot({x: "d => d.a"})));
    expect(e.path).toBe("$.marks[0].x");
    expect(e.message).toMatch(/looks like a JavaScript function/);
  });

  it("are rejected in every form", () => {
    for (const text of ["(d) => d.a", "function (d) { return d.a }", "async d => d", "(d, i) => i", "  x=>x"]) {
      expect(error(() => validate(dot({fill: text}))).path).toBe("$.marks[0].fill");
    }
  });

  it("are rejected in scale options and transform arguments", () => {
    expect(error(() => validate({y: {tickFormat: "(d) => d + '%'"}, marks: [{mark: "dot", data: [1]}]})).path).toBe("$.y.tickFormat");
    expect(error(() => validate(dot({transform: [{filter: "d => d.a > 1"}]}))).path).toBe("$.marks[0].transform[0].filter");
  });

  it("are allowed as text in titles, labels and data", () => {
    expect(() => validate({title: "a => b", x: {label: "x => y"}, marks: [{mark: "text", data: [{t: "d => d"}], text: "t"}]})).not.toThrow();
  });
});

describe("unknown names", () => {
  it("rejects an unknown mark and suggests a known one", () => {
    const e = error(() => validate({marks: [{mark: "dott", data: [1]}]}));
    expect(e.path).toBe("$.marks[0].mark");
    expect(e.message).toBe('unknown mark "dott"; did you mean "dot"?');
  });

  it("rejects marks that are not marks of the allowlist", () => {
    for (const name of ["plot", "legend", "marks", "valueof", "autoSpec", "constructor", "__proto__", "toString"]) {
      expect(error(() => validate({marks: [{mark: name}]})).path).toBe("$.marks[0].mark");
    }
  });

  it("rejects an unknown key of a mark, naming its path", () => {
    const e = error(() => validate(dot({colour: "red"})));
    expect(e.path).toBe("$.marks[0].colour");
    expect(e.message).toMatch(/unknown option "colour" for the dot mark/);
  });

  it("rejects unknown keys at every level", () => {
    expect(error(() => validate({widht: 640, marks: []})).path).toBe("$.widht");
    expect(error(() => validate({x: {tpye: "log"}, marks: []})).path).toBe("$.x.tpye");
    expect(error(() => validate({x: {swatchSize: 5}, marks: []})).path).toBe("$.x.swatchSize");
    expect(error(() => validate({projection: {type: "mercator", zoom: 2}, marks: []})).path).toBe("$.projection.zoom");
    expect(error(() => validate(dot({tip: {fil: "red"}}))).path).toBe("$.marks[0].tip.fil");
    expect(error(() => validate(dot({x: {value: "a", lable: "A"}}))).path).toBe("$.marks[0].x.lable");
    expect(error(() => validate(dot({transform: [{binX: {y: "count", colour: "x"}}]}))).path).toBe("$.marks[0].transform[0].binX.colour");
    expect(error(() => validate({data: {d: {csv: "a\n1", header: true}}, marks: []})).path).toBe('$.data.d.header');
  });

  it("rejects function-only options such as render and initializer", () => {
    expect(error(() => validate(dot({render: "x"}))).path).toBe("$.marks[0].render");
    expect(error(() => validate({document: {}, marks: []})).path).toBe("$.document");
  });

  it("rejects unknown transforms and reducers", () => {
    expect(error(() => validate(dot({transform: [{binx: {y: "count"}}]}))).message).toMatch(/did you mean "binX"/);
    expect(error(() => validate(dot({transform: [{binX: {y: "cout"}}]}))).path).toBe("$.marks[0].transform[0].binX.y");
    expect(error(() => validate(dot({transform: [{binX: {}, stackY: true}]}))).path).toBe("$.marks[0].transform[0]");
    expect(error(() => validate(dot({transform: [{eval: "1"}]}))).path).toBe("$.marks[0].transform[0].eval");
  });

  it("accepts transform options only with their transform", () => {
    const e = error(() => validate(dot({thresholds: 10})));
    expect(e.path).toBe("$.marks[0].thresholds");
    expect(e.message).toMatch(/option of the bin, binX, binY transforms/);
    expect(() => validate(dot({thresholds: 10, transform: [{binX: {y: "count"}}]}))).not.toThrow();
  });

  it("rejects data on marks that take none, and unknown datasets", () => {
    expect(error(() => validate({marks: [{mark: "frame", data: [1]}]})).path).toBe("$.marks[0].data");
    const e = error(() => validate({data: {penguins: []}, marks: [{mark: "dot", data: "penguin"}]}));
    expect(e.path).toBe("$.marks[0].data");
    expect(e.message).toMatch(/did you mean "penguins"/);
  });

  it("rejects prototype keys", () => {
    expect(error(() => validate('{"marks": [], "__proto__": {"polluted": 1}}')).path).toBe("$.__proto__");
    expect(error(() => validate('{"marks": [{"mark": "dot", "data": [{"constructor": 1}]}]}')).path).toBe("$.marks[0].data[0].constructor");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("links", () => {
  it("rejects a javascript: link in inline data, naming the cell", () => {
    const spec = {marks: [{mark: "dot", data: [{x: 1, url: "https://example.com"}, {x: 2, url: "javascript:alert(1)"}], x: "x", href: "url"}]};
    const e = error(() => validate(spec));
    expect(e.path).toBe("$.marks[0].data[1].url");
    expect(e.message).toMatch(/not an allowed link/);
  });

  it("rejects a javascript: link in a dataset, in CSV, in an array channel and in a tip", () => {
    expect(error(() => validate({data: {links: [{url: "JavaScript:void(0)"}]}, marks: [{mark: "dot", data: "links", href: "url"}]})).path).toBe("$.data.links[0].url");
    const csv = error(() => validate({data: {links: {csv: "x,url\n1,/ok\n2,java\tscript:alert(1)\n"}}, marks: [{mark: "dot", data: "links", x: "x", href: "url"}]}));
    expect(csv.path).toBe("$.data.links.csv");
    expect(csv.message).toMatch(/row 2, column "url"/);
    expect(error(() => validate(dot({href: ["https://a.example", "data:text/html,<script>"]}))).path).toBe("$.marks[0].href[1]");
    expect(error(() => validate({marks: [{mark: "dot", data: [{u: "vbscript:x"}], tip: {href: "u"}}]})).path).toBe("$.marks[0].data[0].u");
  });

  it("allows http, https, mailto and relative links", () => {
    const data = [{u: "https://a.example/x"}, {u: "http://b.example"}, {u: "mailto:a@b.example"}, {u: "/docs"}, {u: "#top"}, {u: "page.html"}, {u: null}];
    expect(() => render({marks: [{mark: "dot", data, x: "u", href: "u"}]}, {document: createDocument()})).not.toThrow();
  });
});

describe("remote content", () => {
  const remote = {data: {d: {url: "https://data.example.com/d.csv"}}, marks: [{mark: "dot", data: "d", x: "a", y: "b"}]};

  it("rejects a data URL by default, naming its path", () => {
    const e = error(() => validate(remote));
    expect(e.path).toBe("$.data.d.url");
    expect(e.message).toMatch(/allowRemote is false/);
  });

  it("rejects an image from the network by default", () => {
    const constant = error(() => validate({marks: [{mark: "image", data: [{x: 1}], x: "x", src: "https://img.example.com/a.png"}]}));
    expect(constant.path).toBe("$.marks[0].src");
    const field = error(() => validate({marks: [{mark: "image", data: [{x: 1, s: "//img.example.com/a.png"}], x: "x", src: "s"}]}));
    expect(field.path).toBe("$.marks[0].data[0].s");
    expect(() => validate({marks: [{mark: "image", data: [{x: 1}], x: "x", src: "data:image/png;base64,iVBORw0KGgo="}]})).not.toThrow();
    expect(error(() => validate({marks: [{mark: "image", data: [{x: 1}], x: "x", src: "file:///etc/passwd"}]}, {allowRemote: true})).path).toBe("$.marks[0].src");
  });

  it("checks origins against a list", () => {
    expect(error(() => validate(remote, {allowRemote: ["https://other.example.com"]})).message).toMatch(/not from an allowed origin/);
    expect(() => validate(remote, {allowRemote: ["https://data.example.com/"]})).not.toThrow();
    const relative = {data: {d: {url: "d.csv"}}, marks: []};
    expect(error(() => validate(relative, {allowRemote: ["https://data.example.com"]})).message).toMatch(/needs a baseUrl/);
    expect(() => validate(relative, {allowRemote: ["https://data.example.com"], baseUrl: "https://data.example.com/docs/"})).not.toThrow();
    expect(error(() => validate({data: {d: {url: "ftp://x.example/d.csv"}}, marks: []}, {allowRemote: true})).path).toBe("$.data.d.url");
  });

  it("does not load remote data in the synchronous render", () => {
    const e = error(() => render(remote, {allowRemote: true, document: createDocument()}));
    expect(e.path).toBe("$.data.d");
    expect(e.message).toMatch(/renderAsync/);
  });

  it("loads allowed remote data in renderAsync, without credentials", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response("a,b\n1,2\n3,4\n", {status: 200});
    };
    const figure = await renderAsync(remote, {allowRemote: ["https://data.example.com"], fetch, document: createDocument()});
    expect(figure.querySelectorAll("circle")).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("https://data.example.com/d.csv");
    expect(calls[0]![1]?.credentials).toBe("omit");
  });

  it("checks the data it loads like inline data", async () => {
    const fetch = async () => new Response(JSON.stringify([{u: "javascript:alert(1)"}]));
    const spec = {data: {d: {url: "https://x.example/d.json"}}, marks: [{mark: "dot", data: "d", href: "u"}]};
    const e = await rejection(renderAsync(spec, {allowRemote: true, fetch, document: createDocument()}));
    expect(e.path).toBe("$.data.d[0].u");
  });

  it("enforces the size limit and HTTP errors of remote files", async () => {
    const big = async () => new Response("x".repeat(100));
    expect((await rejection(resolveRemoteData(remote, {allowRemote: true, fetch: big, limits: {maxFetchLength: 50}}))).message).toMatch(/limit of 50/);
    const missing = async () => new Response("", {status: 404});
    expect((await rejection(resolveRemoteData(remote, {allowRemote: true, fetch: missing}))).message).toMatch(/HTTP 404/);
  });
});

describe("CSS", () => {
  it("rejects a remote url() in an option or in data", () => {
    expect(error(() => validate(dot({fill: "url(https://tracker.example/p.svg#a)"}))).path).toBe("$.marks[0].fill");
    expect(error(() => validate({marks: [{mark: "dot", data: [{c: "URL( 'http://t.example/x' )"}], fill: "c"}]})).path).toBe("$.marks[0].data[0].c");
    expect(error(() => validate({style: "background: url(//t.example/x)", marks: []})).path).toBe("$.style");
    expect(error(() => validate({style: {background: "\\75rl(x)"}, marks: []})).path).toBe("$.style.background");
    expect(() => validate(dot({fill: "url(#gradient)"}))).not.toThrow();
    expect(() => validate({marks: [{mark: "text", data: [{t: "curl(1) or hurl (2)"}], text: "t"}]})).not.toThrow();
  });
});

describe("limits", () => {
  it("limits the source length, depth, marks, rows and size", () => {
    expect(error(() => validate(`{"marks": []}${" ".repeat(100)}`, {limits: {maxSourceLength: 50}})).message).toMatch(/limit is 50/);
    let deep: unknown = 1;
    for (let i = 0; i < 100; i++) deep = [deep];
    expect(error(() => validate({marks: [{mark: "dot", data: [deep]}]})).message).toMatch(/deeper than 64/);
    expect(error(() => validate({marks: Array.from({length: 5}, () => ({mark: "frame"}))}, {limits: {maxMarks: 4}})).path).toBe("$.marks");
    expect(error(() => validate({marks: [{mark: "dot", data: [1, 2, 3]}]}, {limits: {maxRows: 2}})).path).toBe("$.marks[0].data");
    expect(error(() => validate({data: {d: {csv: "a\n1\n2\n3\n"}}, marks: []}, {limits: {maxRows: 2}})).path).toBe("$.data.d.csv");
    expect(error(() => validate({width: 100000, marks: []})).path).toBe("$.width");
    expect(error(() => validate({marks: [{mark: "raster", pixelSize: 0.01}]})).path).toBe("$.marks[0].pixelSize");
    expect(error(() => validate({marks: [{mark: "hexgrid", binWidth: 0.1}]})).path).toBe("$.marks[0].binWidth");
    expect(error(() => validate(dot({thresholds: 1e6, transform: [{binX: {y: "count"}}]}))).path).toBe("$.marks[0].thresholds");
  });
});

describe("errors", () => {
  it("reports JSON syntax errors with a line and column", () => {
    const e = error(() => validate('{\n  "marks": [\n    {"mark": "dot",}\n  ]\n}'));
    expect(e.path).toBe("$");
    expect(e.line).toBe(3);
    expect(e.message).toMatch(/^invalid JSON/);
  });

  it("wraps what Plot rejects with the path of the mark", () => {
    const e = error(() => render(dot({curve: "wiggly", mark: "line"}), {document: createDocument()}));
    expect(e.path).toBe("$.marks[0]");
    expect(e.message).toMatch(/Plot rejected this: .*curve/);
  });

  it("rejects a non-object block and a missing marks array", () => {
    expect(error(() => validate("[1, 2]")).path).toBe("$");
    expect(error(() => validate({})).message).toMatch(/needs a "marks" array/);
  });

  it("needs a document outside a browser", () => {
    expect(error(() => render({marks: []})).message).toMatch(/no document/);
  });
});

describe("sanitize", () => {
  const policy = {allowRemote: false as const, baseUrl: undefined};
  const svg = (inner: string) => {
    const document = createDocument();
    const div = document.createElement("div");
    div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
    return div.firstElementChild!;
  };

  it("rejects scripts, event handlers, unsafe links and remote images in the output", () => {
    expect(() => sanitize(svg('<a href="javascript:alert(1)"><text>x</text></a>'), policy)).toThrow(PlotdownError);
    expect(() => sanitize(svg('<g onclick="alert(1)"></g>'), policy)).toThrow(PlotdownError);
    expect(() => sanitize(svg("<script>alert(1)</script>"), policy)).toThrow(PlotdownError);
    expect(() => sanitize(svg('<image href="https://t.example/p.png"></image>'), policy)).toThrow(PlotdownError);
    expect(() => sanitize(svg('<rect fill="url(https://t.example/p.svg#a)"></rect>'), policy)).toThrow(PlotdownError);
    expect(() => sanitize(svg('<a href="https://ok.example"><rect fill="url(#p)" clip-path="url(#c)"></rect></a>'), policy)).not.toThrow();
  });
});