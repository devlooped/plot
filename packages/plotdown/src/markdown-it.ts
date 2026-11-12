// @devlooped/plotdown/markdown-it: a markdown-it plugin that turns plot blocks
// into charts (VitePress, Eleventy, Marp, Slidev, Joplin, the VS Code preview).
import type {MarkdownIt} from "markdown-it";
import {blockHtml, renderBlock, type PlotdownAdapterOptions} from "./adapter.js";

export type {PlotdownAdapterOptions} from "./adapter.js";
export type PlotdownMarkdownItOptions = PlotdownAdapterOptions;

/**
 * Renders fenced `plot`, `oplot` and `observable-plot` blocks as charts:
 *
 * ```js
 * import MarkdownIt from "markdown-it";
 * import plotdown from "@devlooped/plotdown/markdown-it";
 * const md = new MarkdownIt().use(plotdown);
 * ```
 *
 * Wraps the fence rule in place when the plugin is added, so other fences keep
 * the host's rendering (highlighting and all). markdown-it is synchronous:
 * blocks with remote data fail; use the rehype or marked adapter for those.
 */
export default function plotdown(md: MarkdownIt, options: PlotdownMarkdownItOptions = {}): void {
  const previous = md.renderer.rules.fence!; // markdown-it always defines it
  md.renderer.rules.fence = (tokens, idx, mdOptions, env, self) => {
    const token = tokens[idx]!;
    const info = md.utils.unescapeAll(token.info);
    const result = renderBlock(info, token.content, options);
    if (result.kind !== "skip") return blockHtml(result, token.content);
    return previous(tokens, idx, mdOptions, env, self);
  };
}

export {plotdown};
