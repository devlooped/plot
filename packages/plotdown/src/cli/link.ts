/// <reference types="node" />
// `plotdown link`: the image link of a block (a JSON file, stdin) or of each
// block of a Markdown file. Each block is drawn first, as the service would draw
// it, so that a link that would only give an error image is reported instead.
import fs from "node:fs";
import path from "node:path";
import {imageLink, markdownImage, type ImageLinkOptions} from "../link/index.js";
import {renderStatic} from "../static/index.js";
import {relativePath} from "./files.js";
import {scanMarkdown} from "./markdown.js";
import {diagnosticOf, formatDiagnostic, type Diagnostic} from "./render.js";

export interface LinkCommandOptions {
  /** Files to read; "-" or none reads stdin. */
  inputs: string[];
  cwd: string;
  stdin?: () => string;
  link: ImageLinkOptions;
  /** Print `![alt](url)` instead of the URL. */
  markdown: boolean;
  document: Document;
  log: (line: string) => void;
  error: (line: string) => void;
}

interface Source {
  /** The absolute path of the file, or <stdin> in cwd: messages name it relative to cwd. */
  file: string;
  text: string;
  /** A Markdown document (its blocks are linked), or a block. */
  markdown: boolean;
}

function readSources(options: LinkCommandOptions): Source[] {
  const inputs = options.inputs.length ? options.inputs : ["-"];
  return inputs.map((input) => {
    if (input === "-") {
      if (!options.stdin) throw new Error("no standard input to read");
      const text = options.stdin();
      return {file: path.join(options.cwd, "<stdin>"), text, markdown: !text.trim().startsWith("{")};
    }
    const file = path.resolve(options.cwd, input);
    const text = fs.readFileSync(file, "utf8");
    const extension = path.extname(file).toLowerCase();
    const markdown = extension === ".json" ? false : [".md", ".markdown", ".mdx"].includes(extension) ? true : !text.trim().startsWith("{");
    return {file, text, markdown};
  });
}

/** Runs `plotdown link`. Returns 0, or 1 when a block is invalid, too long for a link, or a file cannot be read. */
export function runLink(options: LinkCommandOptions): number {
  let errors = 0;
  const report = (d: Diagnostic) => {
    options.error(formatDiagnostic(d, options.cwd));
    errors++;
  };
  let sources: Source[];
  try {
    sources = readSources(options);
  } catch (error) {
    options.error(`plotdown: ${(error as Error).message}`);
    return 1;
  }
  for (const source of sources) {
    const blocks = source.markdown
      ? scanMarkdown(source.text).blocks.map((b) => ({content: b.content, contentLine: b.contentLine, contentColumns: b.contentColumns}))
      : [{content: source.text, contentLine: 1, contentColumns: [] as number[]}];
    if (source.markdown && blocks.length === 0) {
      options.error(`plotdown: ${relativePath(options.cwd, source.file)} has no plot block`);
      errors++;
      continue;
    }
    for (const block of blocks) {
      try {
        const chart = renderStatic(block.content, {document: options.document});
        const url = imageLink(block.content, options.link);
        options.log(options.markdown ? markdownImage(url, chart.alt) : url);
      } catch (error) {
        report(diagnosticOf(source.file, block, error));
      }
    }
  }
  return errors ? 1 : 0;
}
