import * as Plot from "@observablehq/plot";
import {compilePrepared} from "./compile.js";
import {PlotdownError} from "./errors.js";
import {resolveRemoteData} from "./remote.js";
import {sanitize} from "./sanitize.js";
import type {RenderAsyncOptions, RenderOptions} from "./types.js";
import {prepare} from "./validate.js";

/** What render returns: Plot's <svg>, or a <figure> when the chart has a title, subtitle, caption or legend. */
export type PlotdownFigure = (SVGSVGElement | HTMLElement) & Plot.Plot;

/**
 * Renders a plot block — its text or a parsed object — to an element.
 *
 * Synchronous: a block with remote data (a data URL) throws, even when the host
 * allows remote data; use renderAsync, which loads it first. Outside a browser,
 * pass a jsdom or linkedom document as options.document.
 *
 * Throws a PlotdownError naming the JSON path of the problem.
 */
export function render(source: string | object, options: RenderOptions = {}): PlotdownFigure {
  const prepared = prepare(source, options);
  const plotOptions = compilePrepared(prepared, options);
  if (!options.document && typeof document === "undefined") {
    throw new PlotdownError("$", "there is no document: outside a browser, pass a jsdom or linkedom document as the document option");
  }
  let figure: PlotdownFigure;
  try {
    figure = Plot.plot(plotOptions) as PlotdownFigure;
  } catch (error) {
    if (error instanceof PlotdownError) throw error;
    throw new PlotdownError("$", `Plot rejected this: ${error instanceof Error ? error.message : String(error)}`, {cause: error});
  }
  sanitize(figure, {allowRemote: options.allowRemote ?? false, baseUrl: options.baseUrl});
  return figure;
}

/**
 * Renders a plot block after loading the remote data it names, when the host
 * allows it (options.allowRemote). Rejects with a PlotdownError.
 */
export async function renderAsync(source: string | object, options: RenderAsyncOptions = {}): Promise<PlotdownFigure> {
  return render(await resolveRemoteData(source, options), options);
}
