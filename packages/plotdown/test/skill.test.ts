import fs from "node:fs";
import path from "node:path";
import {Ajv2020} from "ajv/dist/2020.js";
import {describe, expect, it} from "vitest";
import {render, validate} from "../src/index.js";
// @ts-expect-error: a plain ESM script without types
import {generateSkill, paths, splitFrontmatter} from "../scripts/skill.mjs";
import {createDocument, specDir} from "./helpers.js";

const files = generateSkill() as Record<string, string>;
const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null);

/** Every block fenced as plot, oplot or observable-plot, nested ones included, with its line. */
function plotBlocks(markdown: string): {line: number; text: string}[] {
  const blocks: {line: number; text: string}[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s*(`{3,}|~{3,})\s*(plot|oplot|observable-plot)(\s|$)/i.exec(lines[i]!);
    if (!open) continue;
    const fence = open[1]!;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[j]!);
      if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length) break;
      body.push(lines[j]!);
    }
    if (j === lines.length) throw new Error(`unclosed plot block at line ${i + 1}`);
    blocks.push({line: i + 1, text: body.join("\n")});
    i = j;
  }
  return blocks;
}

describe("skill and llms.txt", () => {
  it("are generated from the spec, the schema and the fixtures (run pnpm skill when this fails)", () => {
    const stale = Object.entries(files).filter(([file, content]) => read(file) !== content).map(([file]) => path.relative(process.cwd(), file));
    expect(stale).toEqual([]);
  });

  it("has a skill with a name, a description and a short body", () => {
    const {frontmatter, body} = splitFrontmatter(files[paths.skill]!);
    expect(frontmatter.name).toBe("plot");
    expect(path.basename(path.dirname(paths.skill))).toBe(frontmatter.name);
    expect(frontmatter.description.length).toBeGreaterThan(100);
    expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
    expect(body.split("\n").length).toBeLessThan(500);
    for (const link of body.matchAll(/\]\((references\/[^)]+)\)/g)) expect(fs.existsSync(path.join(path.dirname(paths.skill), link[1]!)), link[1]).toBe(true);
  });

  it("follows the llms.txt layout", () => {
    const llms = files[paths.llms]!;
    expect(llms.startsWith("# plotdown\n\n> ")).toBe(true);
    expect(llms).toContain("## Docs\n");
    expect(llms).toContain("https://plotdown.cc/llms-full.txt");
  });

  const schema = JSON.parse(fs.readFileSync(path.join(specDir, "plot.schema.json"), "utf8"));
  const validateSchema = new Ajv2020({allErrors: true, strict: false, validateFormats: false}).compile(schema);
  const seen = new Set<string>();
  for (const [file, content] of Object.entries(files)) {
    if (!/\.(md|txt)$/.test(file)) continue;
    const blocks = plotBlocks(content);
    const name = path.relative(path.resolve(specDir, ".."), file).replace(/\\/g, "/");
    if (!name.endsWith("catalog.md")) {
      it(`${name} has plot blocks`, () => {
        expect(blocks.length).toBeGreaterThan(0);
      });
    }
    for (const {line, text} of blocks) {
      if (seen.has(text)) continue;
      seen.add(text);
      it(`${name}:${line} validates and renders`, () => {
        validate(text);
        expect(validateSchema(JSON.parse(text)), JSON.stringify(validateSchema.errors)).toBe(true);
        const figure = render(text, {document: createDocument()});
        expect(figure.outerHTML).toMatch(/<svg/);
      });
    }
  }
});
