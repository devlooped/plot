// Renders one plot block into the element Obsidian gives a code block processor.
// Plain DOM only (no innerHTML, no Node APIs), so it runs on desktop and mobile.
import {PlotdownError, render, renderAsync, type FetchOptions} from "@devlooped/plotdown";

export interface BlockOptions {
  /** Whether data URLs and image marks may load from the network. */
  allowRemote: boolean;
  /** The fetch function for remote data (Obsidian's requestUrl, adapted). */
  fetch?: FetchOptions["fetch"];
}

/** The class of the element that holds a block; the chart or the error goes inside. */
export const BLOCK_CLASS = "plotdown";

/**
 * Renders the source of a plot block into el: the chart, or, when the block
 * fails, the source as code with the reason (message, JSON path) under it.
 * Never throws.
 */
export async function renderBlock(source: string, el: HTMLElement, options: BlockOptions): Promise<void> {
  const doc = el.ownerDocument;
  el.classList.add(BLOCK_CLASS);
  let figure: Element;
  try {
    figure = options.allowRemote
      ? await renderAsync(source, {document: doc, allowRemote: true, ...(options.fetch ? {fetch: options.fetch} : {})})
      : render(source, {document: doc});
  } catch (error) {
    showError(el, source, error);
    return;
  }
  const chart = doc.createElement("div");
  chart.className = "plotdown-chart";
  chart.append(figure);
  el.replaceChildren(chart);
}

/** Shows the block's source as code, and the reason it failed under it. */
export function showError(el: HTMLElement, source: string, error: unknown): void {
  const doc = el.ownerDocument;
  el.classList.add(BLOCK_CLASS, "plotdown-failed");

  const pre = doc.createElement("pre");
  const code = doc.createElement("code");
  code.className = "language-json";
  code.textContent = source;
  pre.append(code);

  const reason = doc.createElement("div");
  reason.className = "plotdown-error";
  reason.setAttribute("role", "alert");
  for (const line of describeError(error)) {
    const div = doc.createElement("div");
    div.textContent = line;
    reason.append(div);
  }
  el.replaceChildren(pre, reason);
}

/** The lines that explain an error: what is wrong, where, and what to do. */
export function describeError(error: unknown): string[] {
  if (!(error instanceof PlotdownError)) {
    return [`plotdown: ${error instanceof Error ? error.message : String(error)}`];
  }
  let where = `at ${error.path}`;
  if (error.line !== undefined) where += ` (line ${error.line}${error.column !== undefined ? `, column ${error.column}` : ""})`;
  const lines = [`plotdown: ${error.message}`, where];
  if (/allowRemote is false/.test(error.message)) {
    lines.push("Turn on \"Load remote data\" in the plotdown settings to allow it.");
  }
  return lines;
}
