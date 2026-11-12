import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import zlib from "node:zlib";
import {JSDOM} from "jsdom";
import {parseHTML} from "linkedom";
import {describe, expect, it} from "vitest";
import {PlotdownError} from "../src/index.js";
import {renderStatic, renderSvg} from "../src/static/index.js";
import {base64, encodePng, zlibDeflate} from "../src/static/png.js";
import {textWidth, wrapText} from "../src/static/text.js";
import {fixtureNames, readFixture} from "./helpers.js";

const jsdomDocument = () => new JSDOM("<!DOCTYPE html><html><body></body></html>").window.document;
const linkedomDocument = () => parseHTML("<!DOCTYPE html><html><body></body></html>").document as unknown as Document;
const {DOMParser} = new JSDOM("").window;

/** Parses an SVG text as XML; throws on a syntax error. */
function parseSvg(svg: string): Document {
  const xml = new DOMParser().parseFromString(svg, "image/svg+xml");
  const error = xml.getElementsByTagName("parsererror")[0];
  if (error) throw new Error(`not well-formed: ${error.textContent}`);
  return xml as unknown as Document;
}

function expectStandalone(svg: string): void {
  const xml = parseSvg(svg);
  const root = xml.documentElement;
  expect(root.localName).toBe("svg");
  expect(root.namespaceURI).toBe("http://www.w3.org/2000/svg");
  expect(Number(root.getAttribute("width"))).toBeGreaterThan(0);
  expect(Number(root.getAttribute("height"))).toBeGreaterThan(0);
  // Nothing outside SVG, nothing active, nothing remote.
  for (const element of Array.from(xml.getElementsByTagName("*"))) {
    expect(element.namespaceURI, element.localName).toBe("http://www.w3.org/2000/svg");
    expect(["script", "foreignObject", "iframe"]).not.toContain(element.localName);
    for (const attribute of Array.from(element.attributes)) {
      // Links (<a href>) may go anywhere safe; nothing else may point outside the file.
      if (attribute.name === "href" && element.localName === "image") expect(attribute.value).toMatch(/^data:image\//);
      else if (attribute.name === "href" && element.localName !== "a") expect(attribute.value).toMatch(/^#/);
      expect(attribute.value).not.toMatch(/url\(\s*['"]?(?!#)/);
    }
  }
  expect(svg).not.toMatch(/@import|@font-face/);
}

const withLegend = {
  title: "Penguin body mass",
  subtitle: "Three species",
  caption: "Source: Palmer Station LTER",
  color: {legend: true},
  data: {penguins: {csv: "species,body_mass_g\nAdelie,3750\nGentoo,5000\nChinstrap,3500\nAdelie,3800\nGentoo,5400\n"}},
  marks: [{mark: "rectY", data: "penguins", x: "body_mass_g", fill: "species", transform: [{binX: {y: "count"}}]}, {mark: "ruleY", data: [0]}]
};

describe("renderSvg", () => {
  for (const name of fixtureNames()) {
    it(`renders the fixture ${name} as a well-formed standalone SVG, the same with jsdom and linkedom`, () => {
      const text = readFixture(name);
      const a = renderSvg(text, {document: linkedomDocument()});
      const b = renderSvg(text, {document: jsdomDocument()});
      expectStandalone(a);
      expect(b).toBe(a);
    });
  }

  it("gives the same bytes for the same block, render after render", () => {
    const document = linkedomDocument();
    const first = renderSvg(readFixture("contour"), {document});
    renderSvg(readFixture("frame-facet"), {document}); // Plot's id counters move on
    expect(renderSvg(readFixture("contour"), {document})).toBe(first);
  });

  it("draws the title, subtitle, caption and swatch legend as SVG text", () => {
    const {svg, alt, width} = renderStatic(withLegend, {document: linkedomDocument()});
    expectStandalone(svg);
    expect(alt).toBe("Penguin body mass");
    expect(width).toBe(640 + 16);
    for (const text of ["Penguin body mass", "Three species", "Source: Palmer Station LTER", "Adelie", "Gentoo", "Chinstrap"]) {
      expect(svg).toMatch(new RegExp(`<text[^>]*>${text}</text>`));
    }
    expect(svg).not.toMatch(/<(figure|div|span|h2|h3|figcaption)\b/);
  });

  it("wraps a title wider than the chart", () => {
    const title = "A title long enough that it cannot fit on one line of a chart only three hundred pixels wide";
    const {svg} = renderStatic({title, width: 300, marks: [{mark: "frame"}]}, {document: linkedomDocument()});
    const lines = Array.from(svg.matchAll(/<text[^>]*font-size="16"[^>]*>([^<]*)<\/text>/g), (m) => m[1]);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(title);
  });

  it("draws ramp legends, with their gradient as an inline PNG", () => {
    const spec = {color: {legend: true, scheme: "viridis"}, marks: [{mark: "dot", data: [{a: 1, b: 2}, {a: 2, b: 5}], x: "a", y: "b", fill: "b"}]};
    const svg = renderSvg(spec, {document: linkedomDocument()});
    expectStandalone(svg);
    expect(svg).toMatch(/<svg[^>]*class="plot-d6a7b5-ramp"/);
    expect(svg).toMatch(/href="data:image\/png;base64,/);
  });

  it("draws the raster mark on its own canvas, as a PNG of the right size", () => {
    const svg = renderSvg(readFixture("raster"), {document: jsdomDocument()});
    const href = /href="data:image\/png;base64,([^"]+)"/.exec(svg)![1]!;
    const png = Buffer.from(href, "base64");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width * height).toBeGreaterThan(1);
  });

  it("follows the reader's color scheme, or a fixed theme", () => {
    const document = linkedomDocument();
    expect(renderSvg(withLegend, {document})).toContain("@media (prefers-color-scheme:dark)");
    const light = renderSvg(withLegend, {document, theme: "light"});
    const dark = renderSvg(withLegend, {document, theme: "dark"});
    expect(light).not.toContain("@media");
    expect(light).toContain("#ffffff");
    expect(dark).toContain("#0d1117");
    expect(dark).not.toContain("#ffffff");
  });

  it("names its ids after the block, so that two charts inlined in one page do not clash", () => {
    const document = linkedomDocument();
    const a = renderSvg(readFixture("waffle"), {document});
    const b = renderSvg(readFixture("hexbin"), {document});
    const ids = (svg: string) => Array.from(svg.matchAll(/\bid="([^"]+)"/g), (m) => m[1]);
    expect(ids(a).length).toBeGreaterThan(0);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
    expect(a).not.toMatch(/plot-clip-\d/);
  });

  it("seeds an unseeded shuffle, so that the output stays the same", () => {
    const spec = {marks: [{mark: "dot", data: Array.from({length: 50}, (_, i) => ({x: i % 7, y: i % 5, z: i})), x: "x", y: "y", fill: "z", transform: [{shuffle: true}]}]};
    const document = linkedomDocument();
    expect(renderSvg(spec, {document})).toBe(renderSvg(spec, {document}));
  });

  it("leaves out tips, which need a pointer", () => {
    const svg = renderSvg({marks: [{mark: "lineY", data: [1, 3, 2], tip: true}, {mark: "tip", data: [{x: 1, y: 3}], x: "x", y: "y"}]}, {document: linkedomDocument()});
    expectStandalone(svg);
    expect(svg).not.toContain('aria-label="tip"');
  });

  it("never loads anything: remote data and remote images are refused", () => {
    const document = linkedomDocument();
    expect(() => renderSvg({data: {d: {url: "https://example.com/d.csv"}}, marks: [{mark: "dot", data: "d", x: "a"}]}, {document})).toThrow(PlotdownError);
    expect(() => renderSvg({marks: [{mark: "image", data: [{u: "https://example.com/a.png"}], src: "u", x: 0, y: 0}]}, {document})).toThrow(PlotdownError);
  });

  it("reports invalid blocks and a missing document as PlotdownErrors", () => {
    expect(() => renderSvg('{"marks": [{"mark": "nope"}]}', {document: linkedomDocument()})).toThrow(/unknown mark/);
    expect(() => renderSvg("{", {document: linkedomDocument()})).toThrow(PlotdownError);
    expect(() => renderSvg({marks: []}, {} as never)).toThrow(/document/);
  });
});

describe("the static module", () => {
  it("imports nothing Node-only: the core, and d3-color (which Plot already depends on)", () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/static");
    const imports = new Set<string>();
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) imports.add(m[1]!);
    }
    expect([...imports].filter((s) => !s.startsWith(".")).sort()).toEqual(["d3-color"]);
    expect([...imports].filter((s) => s.startsWith("../")).every((s) => !s.startsWith("../cli"))).toBe(true);
  });
});

describe("png", () => {
  it("deflates what zlib inflates", () => {
    const samples = [new Uint8Array(0), new Uint8Array([1, 2, 3]), new Uint8Array(70000).map((_, i) => (i * 7) % 13), new Uint8Array(5000).map((_, i) => (i * 2654435761) >>> 24)];
    for (const data of samples) expect(new Uint8Array(zlib.inflateSync(zlibDeflate(data)))).toEqual(data);
  });

  it("encodes a PNG whose pixels decode back", () => {
    const rgba = new Uint8Array(4 * 3 * 2).map((_, i) => i * 10);
    const png = Buffer.from(encodePng(3, 2, rgba));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const idatLength = png.readUInt32BE(33);
    const raw = zlib.inflateSync(png.subarray(41, 41 + idatLength));
    expect(raw.length).toBe(2 * (1 + 12));
    expect(Array.from(raw.subarray(1, 13))).toEqual(Array.from(rgba.subarray(0, 12)));
  });

  it("writes base64 as Buffer does", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 100]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37) & 255);
      expect(base64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });
});

describe("text metrics", () => {
  it("estimates widths in the range of a sans-serif font", () => {
    expect(textWidth("Penguin body mass", 16, true)).toBeGreaterThan(120);
    expect(textWidth("Penguin body mass", 16, true)).toBeLessThan(160);
    expect(textWidth("图表", 10)).toBe(20);
  });

  it("wraps at spaces", () => {
    expect(wrapText("aaa bbb ccc", 40, 10)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapText("one\ntwo", 1000, 10)).toEqual(["one", "two"]);
  });
});
