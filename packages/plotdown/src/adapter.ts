// Shared by the parser adapters (markdown-it, rehype, marked): which fences are
// plot blocks, where a document comes from in a build tool, and the HTML a block
// becomes. Imports nothing but the core.
import {PlotdownError} from "./errors.js";
import {isPlotFence} from "./fences.js";
import {render, renderAsync, type PlotdownFigure} from "./render.js";
import type {PlotdownOptions, RenderAsyncOptions} from "./types.js";

/** Options of the markdown-it, rehype and marked adapters. */
export interface PlotdownAdapterOptions extends PlotdownOptions {
  /**
   * "inline" (the default) renders the chart when the Markdown is converted, so
   * the page holds the chart with no script. "client" leaves the block as
   * `<pre><code class="language-plot">` for the browser script `plotdown.js`.
   */
  mode?: "inline" | "client";
  /**
   * The document that creates the chart's elements in inline mode. In a browser
   * the page's document is used. Elsewhere, pass a jsdom or linkedom document
   * (or a function that returns one); without it, the adapter creates one from
   * `linkedom` or `jsdom` when either is installed.
   */
  document?: Document | (() => Document);
  /**
   * Throw when a block fails, so the build fails. By default a failing block
   * stays a code block with the reason under it.
   */
  strict?: boolean;
  /** Called for each block that fails, such as to log a warning. */
  onError?: (error: PlotdownError, code: string) => void;
  /** Loads remote data (with allowRemote); used by adapters that can wait (rehype, marked with async). */
  fetch?: RenderAsyncOptions["fetch"];
}

/** What a fenced block becomes. */
export type BlockResult =
  | {kind: "chart"; figure: PlotdownFigure}
  | {kind: "client"}
  | {kind: "error"; error: PlotdownError}
  | {kind: "skip"};

/**
 * Whether a fence holds a plot block. A `plot` fence whose text does not start
 * with `{` is something else (such as a gnuplot script) and stays plain code;
 * `oplot` and `observable-plot` fences always are blocks.
 */
export function isPlotBlock(info: string | null | undefined, code: string): boolean {
  if (!isPlotFence(info)) return false;
  const word = info!.trim().split(/[\s{]/, 1)[0]!.toLowerCase();
  return word !== "plot" || code.trimStart().startsWith("{");
}

/** Renders a block synchronously, or says what to do with it instead. */
export function renderBlock(info: string | null | undefined, code: string, options: PlotdownAdapterOptions): BlockResult {
  if (!isPlotBlock(info, code)) return {kind: "skip"};
  if (options.mode === "client") return {kind: "client"};
  try {
    return {kind: "chart", figure: titlesAsText(render(code, {...renderOptions(options), document: resolveDocument(options.document)}))};
  } catch (error) {
    return failed(error, code, options);
  }
}

/** Renders a block after loading the remote data it names, when options.allowRemote allows. */
export async function renderBlockAsync(info: string | null | undefined, code: string, options: PlotdownAdapterOptions): Promise<BlockResult> {
  if (!isPlotBlock(info, code)) return {kind: "skip"};
  if (options.mode === "client") return {kind: "client"};
  try {
    const document = resolveDocument(options.document);
    const asyncOptions: RenderAsyncOptions = {...renderOptions(options), document};
    if (options.fetch) asyncOptions.fetch = options.fetch;
    return {kind: "chart", figure: titlesAsText(await renderAsync(code, asyncOptions))};
  } catch (error) {
    return failed(error, code, options);
  }
}

/** How the title and subtitle look once they are paragraphs: as plotdown.js draws them. */
const TITLE_STYLES: Record<string, [className: string, style: string]> = {
  h2: ["plotdown-title", "font-size:1.15em;font-weight:600;margin:0 0 0.25em;line-height:1.3"],
  h3: ["plotdown-subtitle", "font-size:1em;font-weight:400;margin:0 0 0.5em;opacity:0.75;line-height:1.3"]
};

/**
 * Plot writes a chart's title and subtitle as `<h2>` and `<h3>` of its figure.
 * In a page built from Markdown those would be headings of the page: they take
 * the site's heading style, and tables of contents (Starlight's "On this page",
 * VitePress's outline) list them. They become `<p class="plotdown-title">` and
 * `<p class="plotdown-subtitle">`, styled as plotdown.js draws them; the figure's
 * aria-label is left to Plot. plotdown.js and the static SVG are not concerned:
 * the first draws in a shadow root, the second draws the titles as SVG text.
 */
export function titlesAsText<T extends PlotdownFigure>(figure: T): T {
  const element = figure as unknown as Element;
  if (element.localName !== "figure") return figure;
  for (const child of Array.from(element.children)) {
    const styles = TITLE_STYLES[child.localName];
    if (!styles) continue;
    const p = element.ownerDocument.createElement("p");
    p.className = styles[0];
    p.setAttribute("style", styles[1]);
    while (child.firstChild) p.append(child.firstChild);
    child.replaceWith(p);
  }
  return figure;
}

function renderOptions(options: PlotdownAdapterOptions): PlotdownOptions {
  const out: PlotdownOptions = {};
  if (options.allowRemote !== undefined) out.allowRemote = options.allowRemote;
  if (options.baseUrl !== undefined) out.baseUrl = options.baseUrl;
  if (options.limits !== undefined) out.limits = options.limits;
  return out;
}

function failed(error: unknown, code: string, options: PlotdownAdapterOptions): BlockResult {
  const plotdownError =
    error instanceof PlotdownError ? error : new PlotdownError("$", error instanceof Error ? error.message : String(error), {cause: error});
  options.onError?.(plotdownError, code);
  if (options.strict) throw plotdownError;
  return {kind: "error", error: plotdownError};
}

/**
 * The text shown under a block that failed: the reason, the path and, for JSON
 * syntax errors, the place. The same words as plotdown.js in the browser:
 * `plotdown: unknown mark "pie" at $.marks[0].mark`.
 */
export function errorText(error: PlotdownError): string {
  const place = error.line !== undefined ? ` (line ${error.line}${error.column !== undefined ? `, column ${error.column}` : ""})` : "";
  return `plotdown: ${error.message} at ${error.path}${place}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The HTML of a block, for adapters that produce HTML text (markdown-it, marked).
 * - chart: `<div class="plotdown">` around Plot's `<svg>` or `<figure>`;
 * - client: `<pre class="plotdown"><code class="language-plot">`, which plotdown.js renders;
 * - error: the source as `language-json` (so plotdown.js leaves it alone) and the reason under it.
 */
export function blockHtml(result: Exclude<BlockResult, {kind: "skip"}>, code: string): string {
  switch (result.kind) {
    case "chart":
      return `<div class="plotdown">${result.figure.outerHTML}</div>\n`;
    case "client":
      return `<pre class="plotdown"><code class="language-plot">${escapeHtml(code)}</code></pre>\n`;
    case "error":
      return (
        `<div class="plotdown plotdown-error">` +
        `<pre><code class="language-json">${escapeHtml(code)}</code></pre>` +
        `<p class="plotdown-message" role="note">${escapeHtml(errorText(result.error))}</p>` +
        `</div>\n`
      );
  }
}

let created: Document | undefined;

/**
 * The document to render with: the given one, the page's, or one created from
 * `linkedom` (or `jsdom`) when they are installed, in Node. Throws a
 * PlotdownError when there is none.
 */
export function resolveDocument(option: PlotdownAdapterOptions["document"]): Document {
  if (typeof option === "function") return option();
  if (option) return option;
  if (typeof document !== "undefined") return document;
  return (created ??= createDocument());
}

function createDocument(): Document {
  // Synchronous, so that markdown-it and marked renderers can use it: Node's
  // require through process.getBuiltinModule (Node 22.3+). Bundlers for the
  // browser never reach this line, since a page has a document.
  // Looks next to plotdown first (optional peers), then in the project.
  const proc = (globalThis as {process?: {getBuiltinModule?: (id: string) => unknown; cwd?: () => string}}).process;
  const nodeModule = proc?.getBuiltinModule?.("node:module") as {createRequire(from: string): (id: string) => unknown} | undefined;
  if (nodeModule) {
    const load = (id: string): unknown => {
      for (const from of [import.meta.url, `${proc!.cwd?.() ?? "."}/package.json`]) {
        try {
          return nodeModule.createRequire(from)(id);
        } catch {
          // not found from there
        }
      }
      return undefined;
    };
    const html = "<!DOCTYPE html><html><head></head><body></body></html>";
    const linkedom = load("linkedom") as {parseHTML(html: string): {document: Document}} | undefined;
    if (linkedom) return linkedom.parseHTML(html).document;
    const jsdom = load("jsdom") as {JSDOM: new (html: string) => {window: {document: Document}}} | undefined;
    if (jsdom) return new jsdom.JSDOM(html).window.document;
  }
  throw new PlotdownError(
    "$",
    "there is no document: pass one as the document option, or install linkedom or jsdom, to render charts at build time (or use mode: \"client\")"
  );
}
