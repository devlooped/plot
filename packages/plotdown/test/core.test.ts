import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {coerceArray, coerceRows, parseDelimited} from "../src/data.js";
import {FENCE_NAMES, isPlotFence, isPlotSpec, parseIsoDate, PLOT_VERSION, render, SPEC_VERSION, toPlotOptions} from "../src/index.js";
// @ts-expect-error: a plain ESM script without types
import {generate, outputs} from "../scripts/generate.mjs";
import {createDocument} from "./helpers.js";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("fences", () => {
  it("names plot, oplot and observable-plot", () => {
    expect(FENCE_NAMES).toEqual(["plot", "oplot", "observable-plot"]);
    for (const info of ["plot", "oplot", "observable-plot", "Plot", " plot title=x", "plot{.class}"]) expect(isPlotFence(info)).toBe(true);
    for (const info of ["plotly", "gnuplot", "json", "", null, undefined]) expect(isPlotFence(info)).toBe(false);
  });

  it("tells a plot block from gnuplot and from a block still streaming", () => {
    expect(isPlotSpec('{"marks": [{"mark": "dot", "data": [1, 2]}]}')).toBe(true);
    expect(isPlotSpec("  {\n\"marks\": []}\n")).toBe(true);
    expect(isPlotSpec("set terminal png\nplot sin(x) with lines")).toBe(false);
    expect(isPlotSpec('{"marks": [{"mark": "dot", "data": [1, ')).toBe(false);
    expect(isPlotSpec('{"title": "no marks"}')).toBe(false);
    expect(isPlotSpec("[1, 2]")).toBe(false);
  });
});

describe("dates", () => {
  it("parses ISO 8601 dates and times as UTC unless they carry an offset", () => {
    expect(parseIsoDate("2024-03-05")?.toISOString()).toBe("2024-03-05T00:00:00.000Z");
    expect(parseIsoDate("2024-03")?.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(parseIsoDate("2024-03-05T10:20")?.toISOString()).toBe("2024-03-05T10:20:00.000Z");
    expect(parseIsoDate("2024-03-05T10:20:30.5Z")?.toISOString()).toBe("2024-03-05T10:20:30.500Z");
    expect(parseIsoDate("2024-03-05T10:20:30+02:00")?.toISOString()).toBe("2024-03-05T08:20:30.000Z");
    expect(parseIsoDate("2024-03-05T10:20:30-0530")?.toISOString()).toBe("2024-03-05T15:50:30.000Z");
    expect(parseIsoDate("+012024-01-01")?.getUTCFullYear()).toBe(12024);
    for (const text of ["2024", "2024-13-01", "2023-02-30", "2024-03-05 10:20", "03/05/2024", "2024-3-5", "yesterday"]) expect(parseIsoDate(text)).toBeUndefined();
  });

  it("coerces a column only when all its values are ISO dates", () => {
    const rows = coerceRows([{d: "2024-01-01", m: "2024-01-01", n: 1}, {d: null, m: "soon", n: 2}, {d: "2024-02-01", m: "2024-02-01", n: 3}]) as Record<string, unknown>[];
    expect(rows[0]!.d).toBeInstanceOf(Date);
    expect(rows[1]!.d).toBeNull();
    expect(rows[0]!.m).toBe("2024-01-01");
    expect(coerceArray(["2024-01-01", "2024-06-01"])[1]).toBeInstanceOf(Date);
    expect(coerceArray(["2024-01-01", "x"])[0]).toBe("2024-01-01");
    expect(coerceArray([null, null])).toEqual([null, null]);
  });

  it("does not change the block it reads", () => {
    const spec = {x: {domain: ["2024-01-01", "2024-12-31"]}, marks: [{mark: "dot", data: [{d: "2024-05-01"}], x: "d"}]};
    const before = JSON.stringify(spec);
    const options = toPlotOptions(spec) as {x: {domain: unknown[]}};
    expect(options.x.domain[0]).toBeInstanceOf(Date);
    expect(JSON.stringify(spec)).toBe(before);
  });
});

describe("CSV and TSV", () => {
  it("parses quoted fields, CRLF, empty cells, numbers and booleans", () => {
    const rows = parseDelimited('name,value,ok,when\r\n"Smith, J.",1.5e3,true,2024-01-02\r\n"say ""hi""",-.5,false,\r\n', ",", 100);
    expect(rows).toEqual([
      {name: "Smith, J.", value: 1500, ok: true, when: new Date(Date.UTC(2024, 0, 2))},
      {name: 'say "hi"', value: -0.5, ok: false, when: null}
    ]);
    expect(parseDelimited("a\tb\n1\tx y\n", "\t", 10)).toEqual([{a: 1, b: "x y"}]);
    expect(parseDelimited("", ",", 10)).toEqual([]);
    expect(parseDelimited("a,b\n0x10,Infinity\n", ",", 10)).toEqual([{a: "0x10", b: "Infinity"}]);
  });
});

describe("render", () => {
  it("returns an svg, or a figure when there is a title or a legend", () => {
    const document = createDocument();
    expect(render('{"marks": [{"mark": "dot", "data": [1, 2, 3], "x": [1, 2, 3]}]}', {document}).localName).toBe("svg");
    const figure = render({title: "T", color: {legend: true}, marks: [{mark: "dot", data: [{c: "a"}, {c: "b"}], fill: "c"}]}, {document});
    expect(figure.localName).toBe("figure");
    expect(figure.querySelector("h2")?.textContent).toBe("T");
  });

  it("states the versions", () => {
    expect(SPEC_VERSION).toBe("0.1");
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
    expect(pkg.dependencies["@observablehq/plot"]).toBe(PLOT_VERSION);
  });
});

describe("package", () => {
  it("has generated files that match Plot's declarations and the catalog", () => {
    const {api, schema} = generate();
    const read = (file: string) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    expect(read(outputs.api) === api, "src/generated/plot-api.ts is stale: run pnpm generate").toBe(true);
    expect(read(outputs.schema) === schema, "spec/plot.schema.json is stale: run pnpm generate").toBe(true);
  });

  it("keeps the core free of Node-only modules", () => {
    // Follows the imports of the core entry; the subpath adapters (markdown-it, react, …) may import their hosts.
    const srcDir = path.join(packageDir, "src");
    const imports = new Set<string>();
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const specifier = m[1]!;
        if (specifier.startsWith(".")) visit(path.resolve(path.dirname(file), specifier.replace(/\.js$/, ".ts")));
        else imports.add(specifier);
      }
    };
    visit(path.join(srcDir, "index.ts"));
    expect(seen.size).toBeGreaterThan(5);
    expect([...imports].filter((s) => s !== "@observablehq/plot")).toEqual([]);
  });

  it("has no path to eval or Function", () => {
    const srcDir = path.join(packageDir, "src");
    const files = fs.readdirSync(srcDir, {recursive: true, encoding: "utf8"}).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const text = fs.readFileSync(path.join(srcDir, file), "utf8");
      expect(text, file).not.toMatch(/\beval\s*\(|new\s+Function\b|\bFunction\s*\(|setTimeout\s*\(\s*["'`]/);
    }
  });
});
