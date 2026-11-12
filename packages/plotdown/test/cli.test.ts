import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {main, type CommandIo} from "../src/cli/index.js";
import {applyImages, imageLine, scanMarkdown} from "../src/cli/markdown.js";
import {slugOf} from "../src/cli/render.js";

const dot = '{"title": "Dots", "marks": [{"mark": "dot", "data": [{"x": 1, "y": 2}, {"x": 2, "y": 3}], "x": "x", "y": "y"}]}';
const bars = '{"marks": [{"mark": "barY", "data": [1, 2, 3]}]}';

describe("scanMarkdown", () => {
  it("finds plot, oplot and observable-plot fences of backticks or tildes, of any length", () => {
    const text = ["```plot", dot, "```", "", "~~~oplot", bars, "~~~", "", "`````observable-plot {.wide}", bars, "`````", "", "```PLOT", bars, "```"].join("\n");
    const {blocks} = scanMarkdown(text);
    expect(blocks.map((b) => [b.fence, b.openLine, b.closeLine, b.contentLine])).toEqual([
      ["plot", 0, 2, 2],
      ["oplot", 4, 6, 6],
      ["observable-plot", 8, 10, 10],
      ["plot", 12, 14, 14]
    ]);
    expect(blocks[0]!.content).toBe(dot);
  });

  it("does not take a plot fence inside another fence for a block", () => {
    const text = ["````markdown", "```plot", bars, "```", "````", "", "~~~", "```plot", "~~~", "```js", "```plot", "```"].join("\n");
    expect(scanMarkdown(text).blocks).toEqual([]);
  });

  it("needs a closing fence at least as long as the opening one, of the same character", () => {
    const text = ["````plot", "{", "```", "~~~~", '"marks": []}', "````"].join("\n");
    const [block] = scanMarkdown(text).blocks;
    expect(block!.content).toBe(['{', "```", "~~~~", '"marks": []}'].join("\n"));
  });

  it("finds blocks in block quotes and list items, without their prefixes", () => {
    const text = ["> quote", "> ```plot", "> " + bars, "> ```", "", "- item", "  ```oplot", "  " + bars, "  ```", "", "1. > nested", "   > ~~~plot", "   > " + bars, "   > ~~~"].join("\n");
    const {blocks} = scanMarkdown(text);
    expect(blocks.map((b) => [b.content, b.prefix])).toEqual([
      [bars, "> "],
      [bars, "  "],
      [bars, "   > "]
    ]);
    expect(blocks[0]!.contentColumns).toEqual([2]);
  });

  it("removes the indentation of an indented fence from its content", () => {
    const [block] = scanMarkdown(["  ```plot", "  {", "    \"marks\": []", "  }", "  ```"].join("\n")).blocks;
    expect(block!.content).toBe('{\n  "marks": []\n}');
  });

  it("ends a fence with its container, and reports a plot fence that is never closed", () => {
    const quoted = scanMarkdown(["> ```plot", "> " + bars, "", "after"].join("\n"));
    expect(quoted.blocks).toEqual([]);
    expect(quoted.unclosed).toEqual([1]);
    expect(scanMarkdown(["text", "```plot", bars].join("\n")).unclosed).toEqual([2]);
  });

  it("finds the image line that follows a block", () => {
    const {blocks} = scanMarkdown(["```plot", bars, "```", "![Chart](plots/a-1f3a9c.svg) <!-- plot:1f3a9c -->"].join("\n"));
    expect(blocks[0]!.imageLine).toBe(3);
    expect(blocks[0]!.imageHash).toBe("1f3a9c");
  });
});

describe("applyImages", () => {
  it("inserts an image line after each block, in its container, apart from the text that follows", () => {
    const text = ["```plot", bars, "```", "Text.", "", "> ```plot", "> " + bars, "> ```", "> More."].join("\r\n");
    const scan = scanMarkdown(text);
    const images = new Map(scan.blocks.map((b, i) => [b, imageLine("Chart", `plots/doc-00000${i}.svg`, `00000${i}`)]));
    const result = applyImages(scan, images);
    expect(result.split("\r\n")).toEqual([
      "```plot", bars, "```", "![Chart](plots/doc-000000.svg) <!-- plot:000000 -->", "", "Text.", "",
      "> ```plot", "> " + bars, "> ```", "> ![Chart](plots/doc-000001.svg) <!-- plot:000001 -->", ">", "> More."
    ]);
    const again = scanMarkdown(result);
    expect(applyImages(again, new Map(again.blocks.map((b, i) => [b, imageLine("Chart", `plots/doc-00000${i}.svg`, `00000${i}`)])))).toBe(result);
  });

  it("replaces the image line of a block, the plan's older form included", () => {
    const scan = scanMarkdown(["```plot", bars, "```", "<!-- plot:aaaaaa --> ![Old](plots/doc-aaaaaa.svg)"].join("\n"));
    const result = applyImages(scan, new Map([[scan.blocks[0]!, imageLine("New [1]", "plots/my doc-bbbbbb.svg", "bbbbbb")]]));
    expect(result.split("\n")[3]).toBe("![New \\[1\\]](plots/my%20doc-bbbbbb.svg) <!-- plot:bbbbbb -->");
  });
});

describe("plotdown render", () => {
  let dir: string;
  let out: string[];
  let err: string[];
  let io: CommandIo;
  const run = (...args: string[]) => main(["render", ...args], io);
  const read = (file: string) => fs.readFileSync(path.join(dir, file), "utf8");
  const plots = () => (fs.existsSync(path.join(dir, "docs/plots")) ? fs.readdirSync(path.join(dir, "docs/plots")).sort() : []);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "plotdown-cli-"));
    out = [];
    err = [];
    io = {cwd: dir, log: (l) => out.push(l), error: (l) => err.push(l), env: {}};
  });

  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it("writes one SVG per block and an image after it; a second run changes nothing", () => {
    fs.writeFileSync(path.join(dir, "readme.md"), ["# Doc", "", "```plot", dot, "```", "", "```oplot", bars, "```", ""].join("\n"));
    expect(run("readme.md")).toBe(0);
    const files = plots();
    expect(files).toHaveLength(2);
    expect(files.every((f) => /^readme-[0-9a-f]{6}\.svg$/.test(f))).toBe(true);
    const text = read("readme.md");
    expect(text).toMatch(/```\n!\[Dots\]\(docs\/plots\/readme-([0-9a-f]{6})\.svg\) <!-- plot:\1 -->\n/);
    expect(text).toMatch(/```\n!\[Chart\]\(docs\/plots\/readme-[0-9a-f]{6}\.svg\) <!-- plot:[0-9a-f]{6} -->\n/);
    expect(text).toContain(dot); // the block stays

    const svg = read(`docs/plots/${files[0]}`);
    out = [];
    expect(run("readme.md")).toBe(0);
    expect(read("readme.md")).toBe(text);
    expect(read(`docs/plots/${files[0]}`)).toBe(svg);
    expect(out).toEqual(["plotdown: 1 file, 2 blocks, up to date"]);
    expect(run("--check", "readme.md")).toBe(0);
  });

  it("links images relative to each Markdown file, and finds files by glob", () => {
    fs.mkdirSync(path.join(dir, "docs/guide"), {recursive: true});
    fs.mkdirSync(path.join(dir, "node_modules/x"), {recursive: true});
    fs.writeFileSync(path.join(dir, "docs/guide/intro.md"), ["```plot", bars, "```"].join("\n"));
    fs.writeFileSync(path.join(dir, "node_modules/x/readme.md"), ["```plot", bars, "```"].join("\n"));
    expect(run("**/*.md")).toBe(0);
    expect(read("docs/guide/intro.md")).toMatch(/\]\(\.\.\/plots\/docs-guide-intro-[0-9a-f]{6}\.svg\)/);
    expect(read("node_modules/x/readme.md")).not.toContain("<!-- plot:");
  });

  it("with --check, changes nothing and fails when a run would change something", () => {
    fs.writeFileSync(path.join(dir, "a.md"), ["```plot", bars, "```"].join("\n"));
    expect(run("--check", "a.md")).toBe(1);
    expect(read("a.md")).not.toContain("<!-- plot:");
    expect(plots()).toEqual([]);
    expect(out.some((l) => l.startsWith("would write docs/plots/a-"))).toBe(true);
    expect(err.at(-1)).toMatch(/2 changes pending/);
  });

  it("updates the image of a changed block and removes the SVG that nothing references", () => {
    fs.writeFileSync(path.join(dir, "a.md"), ["```plot", bars, "```"].join("\n"));
    fs.mkdirSync(path.join(dir, "docs/plots"), {recursive: true});
    fs.writeFileSync(path.join(dir, "docs/plots/other.svg"), "<svg/>");
    run("a.md");
    const [before] = plots().filter((f) => f.startsWith("a-"));
    fs.writeFileSync(path.join(dir, "a.md"), read("a.md").replace("[1, 2, 3]", "[3, 2, 1]"));
    expect(run("a.md")).toBe(0);
    const after = plots();
    expect(after).not.toContain(before);
    expect(after).toContain("other.svg");
    expect(after.filter((f) => f.startsWith("a-"))).toHaveLength(1);
    expect(read("a.md").match(/<!-- plot:/g)).toHaveLength(1);
  });

  it("reports an invalid block with its file, line and JSON path, fails, and leaves the file as it is", () => {
    const text = ["# Title", "", "> ```plot", '> {"marks": [{"mark": "barZ", "data": [1]}]}', "> ```", "", "```plot", "{", '  "marks" []', "}", "```", "", "```plot", bars, "```"].join("\n");
    fs.writeFileSync(path.join(dir, "bad.md"), text);
    io.env.GITHUB_ACTIONS = "true";
    expect(run("bad.md")).toBe(1);
    expect(read("bad.md")).toBe(text);
    expect(plots()).toEqual([]);
    expect(err).toContain('bad.md:4: error: $.marks[0].mark: unknown mark "barZ"; did you mean "barX"?');
    expect(err.some((l) => /^bad\.md:9:11: error: \$: invalid JSON: Expected ':'/.test(l))).toBe(true);
    expect(out).toContain('::error file=bad.md,line=4::$.marks[0].mark: unknown mark "barZ"; did you mean "barX"?');
    expect(err.at(-1)).toMatch(/2 invalid blocks/);
  });

  it("writes the SVG files where --out says", () => {
    fs.writeFileSync(path.join(dir, "a.md"), ["```plot", bars, "```"].join("\n"));
    expect(run("--out", "assets/charts", "a.md")).toBe(0);
    expect(read("a.md")).toMatch(/\]\(assets\/charts\/a-[0-9a-f]{6}\.svg\)/);
  });

  it("explains its usage", () => {
    expect(main([], io)).toBe(1);
    expect(out.join("\n")).toContain("render");
    expect(main(["render", "--help"], io)).toBe(0);
    expect(run()).toBe(1);
    expect(err.at(-1)).toContain("Usage: plotdown render");
    expect(run("--theme", "pink", "a.md")).toBe(1);
    expect(main(["draw"], io)).toBe(1);
    expect(run("missing.md")).toBe(1);
    expect(err).toContain("plotdown: no file matches missing.md");
  });

  it("names the SVG files after the path of their Markdown file", () => {
    expect(slugOf("/repo/readme.md", "/repo")).toBe("readme");
    expect(slugOf("/repo/Docs/Getting Started.md", "/repo")).toBe("docs-getting-started");
  });
});
