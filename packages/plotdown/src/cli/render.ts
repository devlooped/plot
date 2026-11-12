/// <reference types="node" />
// `plotdown render`: one SVG per plot block, and an image line after the block.
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {PlotdownError} from "../errors.js";
import {imageLink, type ImageLinkOptions} from "../link/index.js";
import {renderStatic, type StaticChart, type StaticTheme} from "../static/index.js";
import {expandFiles, relativePath} from "./files.js";
import {applyImages, imageLine, scanMarkdown, type PlotBlock} from "./markdown.js";

/** A problem in a Markdown file, at a 1-based line and column. */
export interface Diagnostic {
  file: string;
  line: number;
  column?: number;
  /** The JSON path of the offending value, such as $.marks[0].x. */
  path?: string;
  message: string;
  severity: "error" | "warning";
}

/** Where the image of a block goes: a file next to the docs (render), or a link of the image service (render --link). */
export interface ImageTarget {
  /** The URL that the Markdown file shows for a chart (drawn from the text of its block), and the file to write for it, if any. */
  place(chart: StaticChart, markdownFile: string, block: string): {url: string; hash: string; file?: {path: string; content: string}};
  /** Files that belonged to a Markdown file and that its new text no longer references. */
  stale?(markdownFile: string, text: string): string[];
}

export interface RenderFileOptions {
  document: Document;
  target: ImageTarget;
  theme?: StaticTheme;
}

/** What rendering a Markdown file would change. */
export interface FilePlan {
  file: string;
  before: string;
  after: string;
  writes: {path: string; content: string}[];
  removals: string[];
  diagnostics: Diagnostic[];
  /** How many plot blocks the file has. */
  blocks: number;
}

/** The first hex digits of the SHA-256 of a text. */
export function contentHash(text: string, length = 6): string {
  return createHash("sha256").update(text).digest("hex").slice(0, length);
}

/** A name for a Markdown file that is unique in the repository: its path from cwd, as a slug. */
export function slugOf(markdownFile: string, cwd: string): string {
  const relative = relativePath(cwd, markdownFile).replace(/\.[^./]+$/, "");
  return relative.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "plot";
}

/** Images as SVG files in one directory, named after the Markdown file and the hash of the SVG. */
export function fileTarget(outDir: string, cwd: string): ImageTarget {
  const nameOf = (markdownFile: string, hash: string) => `${slugOf(markdownFile, cwd)}-${hash}.svg`;
  return {
    place(chart, markdownFile) {
      const hash = contentHash(chart.svg);
      const file = path.join(outDir, nameOf(markdownFile, hash));
      return {url: relativePath(path.dirname(markdownFile), file), hash, file: {path: file, content: chart.svg}};
    },
    stale(markdownFile, text) {
      if (!fs.existsSync(outDir)) return [];
      const slug = slugOf(markdownFile, cwd);
      const own = new RegExp(`^${slug.replace(/[-]/g, "\\-")}-([0-9a-f]{6})\\.svg$`);
      return fs
        .readdirSync(outDir)
        .filter((name) => own.test(name) && !text.includes(name))
        .sort()
        .map((name) => path.join(outDir, name));
    }
  };
}

/**
 * Images as links of the image service, with the block in the URL: nothing is
 * written. The SVG files that an earlier `plotdown render` wrote for the
 * Markdown file (found by `files`) are no longer referenced, so they are removed.
 */
export function linkTarget(options: ImageLinkOptions, files?: ImageTarget): ImageTarget {
  return {
    place(_chart, _markdownFile, block) {
      const url = imageLink(block, options);
      return {url, hash: contentHash(url)};
    },
    stale: files?.stale
  };
}

export function diagnosticOf(file: string, block: Pick<PlotBlock, "contentLine" | "contentColumns">, error: unknown): Diagnostic {
  if (error instanceof PlotdownError) {
    if (error.line === undefined) return {file, line: block.contentLine, path: error.path, message: error.message, severity: "error"};
    const column = error.column === undefined ? undefined : error.column + (block.contentColumns[error.line - 1] ?? 0);
    return {file, line: block.contentLine + error.line - 1, column, path: error.path, message: error.message, severity: "error"};
  }
  return {file, line: block.contentLine, message: error instanceof Error ? error.message : String(error), severity: "error"};
}

/** Renders the blocks of one Markdown text and plans the changes, without touching the disk (but to list stale files). */
export function planFile(file: string, text: string, options: RenderFileOptions): FilePlan {
  const scan = scanMarkdown(text);
  const diagnostics: Diagnostic[] = scan.unclosed.map((line) => ({file, line, message: "the plot fence is never closed: the block is not rendered", severity: "warning" as const}));
  const images = new Map<PlotBlock, string>();
  const writes = new Map<string, string>();
  for (const block of scan.blocks) {
    try {
      const chart = renderStatic(block.content, {document: options.document, theme: options.theme});
      const placed = options.target.place(chart, file, block.content);
      images.set(block, imageLine(chart.alt, placed.url, placed.hash));
      if (placed.file) writes.set(placed.file.path, placed.file.content);
    } catch (error) {
      diagnostics.push(diagnosticOf(file, block, error));
    }
  }
  const failed = diagnostics.some((d) => d.severity === "error");
  if (failed) return {file, before: text, after: text, writes: [], removals: [], diagnostics, blocks: scan.blocks.length};
  const after = applyImages(scan, images);
  const removals = options.target.stale?.(file, after) ?? [];
  return {file, before: text, after, writes: Array.from(writes, ([p, content]) => ({path: p, content})), removals, diagnostics, blocks: scan.blocks.length};
}

const normalizeEol = (text: string) => text.replace(/\r\n/g, "\n");

/** The changes of a plan that the disk does not have yet. */
export function pendingChanges(plan: FilePlan): {markdown: boolean; writes: {path: string; content: string}[]; removals: string[]} {
  const writes = plan.writes.filter((w) => !fs.existsSync(w.path) || normalizeEol(fs.readFileSync(w.path, "utf8")) !== normalizeEol(w.content));
  return {markdown: plan.after !== plan.before, writes, removals: plan.removals.filter((r) => fs.existsSync(r))};
}

export interface RenderCommandOptions {
  patterns: string[];
  cwd: string;
  outDir: string;
  check: boolean;
  theme: StaticTheme;
  document: Document;
  log: (line: string) => void;
  error: (line: string) => void;
  /** Writes GitHub Actions annotations for diagnostics. */
  annotate: boolean;
  /** Links of the image service in place of SVG files (render --link). */
  link?: ImageLinkOptions;
}

/** A message on one line: JSON errors may quote the block, newlines included. */
function oneLine(message: string): string {
  return message.replace(/\s*\r?\n\s*/g, " ");
}

export function formatDiagnostic(d: Diagnostic, cwd: string): string {
  const where = `${relativePath(cwd, d.file)}:${d.line}${d.column !== undefined ? `:${d.column}` : ""}`;
  return `${where}: ${d.severity}: ${d.path ? `${d.path}: ` : ""}${oneLine(d.message)}`;
}

export function annotation(d: Diagnostic, cwd: string): string {
  const escape = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const props = `file=${relativePath(cwd, d.file)},line=${d.line}${d.column !== undefined ? `,col=${d.column}` : ""}`;
  return `::${d.severity} ${props}::${escape(`${d.path ? `${d.path}: ` : ""}${oneLine(d.message)}`)}`;
}

/** Runs `plotdown render`. Returns the exit code: 0, or 1 on an error or (with --check) on a pending change. */
export function runRender(options: RenderCommandOptions): number {
  const {cwd, log, error} = options;
  const {files, unmatched} = expandFiles(options.patterns, cwd);
  let errors = 0;
  for (const pattern of unmatched) error(`plotdown: no file matches ${pattern}`);
  if (files.length === 0) {
    error("plotdown: no Markdown file to render");
    return 1;
  }
  const svgFiles = fileTarget(path.resolve(cwd, options.outDir), cwd);
  const target = options.link ? linkTarget(options.link, svgFiles) : svgFiles;
  let pending = 0;
  let blocks = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const plan = planFile(file, text, {document: options.document, target, theme: options.theme});
    blocks += plan.blocks;
    for (const d of plan.diagnostics) {
      error(formatDiagnostic(d, cwd));
      if (options.annotate) log(annotation(d, cwd));
      if (d.severity === "error") errors++;
    }
    const changes = pendingChanges(plan);
    const rel = (p: string) => relativePath(cwd, p);
    const verb = options.check ? "would " : "";
    for (const w of changes.writes) log(`${verb}write ${rel(w.path)}`);
    if (changes.markdown) log(`${verb}update ${rel(file)}`);
    for (const r of changes.removals) log(`${verb}remove ${rel(r)}`);
    pending += changes.writes.length + changes.removals.length + (changes.markdown ? 1 : 0);
    if (options.check) continue;
    for (const w of changes.writes) {
      fs.mkdirSync(path.dirname(w.path), {recursive: true});
      fs.writeFileSync(w.path, w.content);
    }
    if (changes.markdown) fs.writeFileSync(file, plan.after);
    for (const r of changes.removals) fs.rmSync(r);
  }
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const summary = `plotdown: ${plural(files.length, "file")}, ${plural(blocks, "block")}`;
  if (errors > 0) {
    error(`${summary}, ${plural(errors, "invalid block")}: the files that hold them are left as they are`);
    return 1;
  }
  if (options.check && pending > 0) {
    error(`${summary}: ${plural(pending, "change")} pending; run plotdown render to apply them`);
    return 1;
  }
  log(`${summary}${pending ? `, ${plural(pending, "change")}` : ", up to date"}`);
  return 0;
}