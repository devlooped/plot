// Finds the plot blocks of a Markdown text and puts an image line after each.
//
// A small CommonMark scanner: it follows block quotes and list items (the
// containers a fence can sit in), fences of backticks or tildes of any length,
// and every fenced block, so that a ```plot example inside a ````markdown fence
// is not taken for a block. It needs nothing but the text.
import {isPlotFence} from "../fences.js";

export interface PlotBlock {
  /** The first word of the info string: plot, oplot or observable-plot. */
  fence: string;
  /** 0-based index of the opening fence line. */
  openLine: number;
  /** 0-based index of the closing fence line. */
  closeLine: number;
  /** 1-based line number of the first line of the content. */
  contentLine: number;
  /** The text of the block, without the container prefixes and the fence's indentation. */
  content: string;
  /** For each line of the content, how many columns of the Markdown line precede it. */
  contentColumns: number[];
  /** What precedes the fence on its closing line (quote markers, indentation): lines inserted after the block start with it. */
  prefix: string;
  /** 0-based index of the image line that follows the block, when there is one. */
  imageLine?: number;
  /** The hash that the image line names. */
  imageHash?: string;
}

export interface MarkdownScan {
  lines: string[];
  /** The line ending of the text: "\r\n" or "\n". */
  eol: string;
  blocks: PlotBlock[];
  /** Plot fences that are never closed, as 1-based line numbers; they are not rendered. */
  unclosed: number[];
}

/** The marker of an image line: `<!-- plot:1f3a9c -->`. */
export const IMAGE_MARKER = /<!-- plot:([0-9a-f]{6,64}) -->/;

type Container = {kind: "quote"} | {kind: "item"; indent: number};

interface OpenFence {
  char: string;
  length: number;
  indent: number;
  info: string;
  openLine: number;
  depth: number;
  content: string[];
  columns: number[];
}

function expandTabs(line: string): string {
  if (!line.includes("\t")) return line;
  let out = "";
  for (const char of line) {
    if (char === "\t") out += " ".repeat(4 - (out.length % 4));
    else out += char;
  }
  return out;
}

function leadingSpaces(text: string): number {
  return /^ */.exec(text)![0].length;
}

/** Scans a Markdown text for plot blocks. */
export function scanMarkdown(text: string): MarkdownScan {
  const eol = /\r\n/.test(text) ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const blocks: PlotBlock[] = [];
  const unclosed: number[] = [];
  const containers: Container[] = [];
  let fence: OpenFence | null = null;

  const endFence = () => {
    if (fence && isPlotFence(fence.info)) unclosed.push(fence.openLine + 1);
    fence = null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = expandTabs(lines[index]!);
    let rest = line;
    let matched = 0;
    for (const container of containers) {
      if (container.kind === "quote") {
        const m = /^ {0,3}> ?/.exec(rest);
        if (!m) break;
        rest = rest.slice(m[0].length);
      } else if (rest.trim() === "") {
        rest = "";
      } else if (leadingSpaces(rest) >= container.indent) {
        rest = rest.slice(container.indent);
      } else {
        break;
      }
      matched++;
    }

    if (fence) {
      const open: OpenFence = fence;
      if (matched >= open.depth) {
        const close = /^( {0,3})(`{3,}|~{3,})[ ]*$/.exec(rest);
        if (close && close[2]![0] === open.char && close[2]!.length >= open.length) {
          if (isPlotFence(open.info)) {
            blocks.push({
              fence: open.info.split(/[\s{]/, 1)[0]!.toLowerCase(),
              openLine: open.openLine,
              closeLine: index,
              contentLine: open.openLine + 2,
              content: open.content.join("\n"),
              contentColumns: open.columns,
              prefix: line.slice(0, line.length - rest.length) + close[1]
            });
          }
          fence = null;
        } else {
          const strip = Math.min(open.indent, leadingSpaces(rest));
          open.content.push(rest.slice(strip));
          open.columns.push(line.length - rest.length + strip);
        }
        continue;
      }
      // A container of the fence ended: so did the fence.
      endFence();
    }

    containers.length = matched;
    for (;;) {
      const quote = /^ {0,3}> ?/.exec(rest);
      if (quote) {
        containers.push({kind: "quote"});
        rest = rest.slice(quote[0].length);
        continue;
      }
      const item = /^( {0,3})([-+*]|\d{1,9}[.)])( *)/.exec(rest);
      if (item && (item[3]!.length > 0 || item[0].length === rest.length)) {
        const marker = item[1]!.length + item[2]!.length;
        const spaces = item[3]!.length;
        const blank = item[0].length === rest.length;
        const indent = blank || spaces > 4 ? marker + 1 : marker + spaces;
        containers.push({kind: "item", indent});
        rest = blank ? "" : rest.slice(Math.min(indent, rest.length));
        continue;
      }
      break;
    }

    const open = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(rest);
    if (open && !(open[2]![0] === "`" && open[3]!.includes("`"))) {
      fence = {char: open[2]![0]!, length: open[2]!.length, indent: open[1]!.length, info: open[3]!.trim(), openLine: index, depth: containers.length, content: [], columns: []};
    }
  }
  endFence();

  for (const block of blocks) {
    const next = lines[block.closeLine + 1];
    const marker = next === undefined ? null : IMAGE_MARKER.exec(next);
    if (marker) {
      block.imageLine = block.closeLine + 1;
      block.imageHash = marker[1];
    }
  }
  return {lines, eol, blocks, unclosed};
}

/** Escapes the alternative text of a Markdown image. */
export function escapeAlt(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[\\[\]]/g, (c) => `\\${c}`);
}

/** A URL or relative path written as the destination of a Markdown image. */
export function escapeDestination(url: string): string {
  return url.replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

/**
 * The image line of a block: `![alt](url) <!-- plot:hash -->`. The image comes
 * first: a line that starts with `<!--` is an HTML block in CommonMark, and the
 * Markdown image after the comment would be shown as text.
 */
export function imageLine(alt: string, url: string, hash: string): string {
  return `![${escapeAlt(alt)}](${escapeDestination(url)}) <!-- plot:${hash} -->`;
}

/**
 * The text with the image line of each block inserted or replaced. `images`
 * maps a block to its line (without the container prefix); blocks that are not
 * in it are left as they are.
 */
export function applyImages(scan: MarkdownScan, images: ReadonlyMap<PlotBlock, string>): string {
  const lines = scan.lines.slice();
  const ordered = scan.blocks.filter((b) => images.has(b)).sort((a, b) => b.closeLine - a.closeLine);
  for (const block of ordered) {
    const image = images.get(block)!;
    if (block.imageLine !== undefined) {
      const existing = lines[block.imageLine]!;
      const prefix = /^(.*?)(?:!\[|<!--)/.exec(existing)?.[1] ?? block.prefix;
      lines[block.imageLine] = prefix + image;
    } else {
      const inserted = [block.prefix + image];
      const next = lines[block.closeLine + 1];
      // A text line right after the image would join its paragraph: keep them apart.
      if (next !== undefined && !isBlankInContainer(next)) inserted.push(block.prefix.trimEnd());
      lines.splice(block.closeLine + 1, 0, ...inserted);
    }
  }
  return lines.join(scan.eol);
}

function isBlankInContainer(line: string): boolean {
  return /^[\s>]*$/.test(line);
}
