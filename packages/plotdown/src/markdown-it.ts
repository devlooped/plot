// @devlooped/plotdown/markdown-it: a markdown-it plugin that turns plot blocks
// into charts (VitePress, Eleventy, Marp, Slidev, Joplin, the VS Code preview).
import type {MarkdownIt} from "markdown-it";
import {blockHtml, renderBlock, type PlotdownAdapterOptions} from "./adapter.js";

export type {PlotdownAdapterOptions} from "./adapter.js";
export interface PlotdownMarkdownItOptions extends PlotdownAdapterOptions {
  /**
   * The HTML becomes a Vue template (VitePress, VuePress): Plot's `<style>`
   * elements are written as `<component is="style">`, which Vue keeps, and
   * braces as character references, so that no `{{…}}` of a block is evaluated.
   * By default, on when markdown-it runs under mdit-vue (its env has sfcBlocks).
   */
  vue?: boolean;
}

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
    if (result.kind === "skip") return previous(tokens, idx, mdOptions, env, self);
    const html = blockHtml(result, token.content);
    const vue = options.vue ?? (typeof env === "object" && env !== null && "sfcBlocks" in env);
    return vue ? forVue(html) : html;
  };
}

/** Makes the HTML of a block safe and whole as a Vue template. */
function forVue(html: string): string {
  return html
    .replace(/<style(?=[\s>])/g, '<component is="style"')
    .replace(/<\/style>/g, "</component>")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

export {plotdown};
