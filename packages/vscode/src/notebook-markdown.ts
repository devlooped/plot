// Notebook Markdown cells (and text/markdown outputs): extends VS Code's built-in
// markdown-it renderer (vscode.markdown-it-renderer), which runs in the notebook
// webview. The plugin marks the plot blocks; once the renderer has put the HTML
// of a cell in its shadow root, the blocks there are drawn. Remote data is off:
// the notebook webview cannot ask the setting, and a cell may come from anyone.
import type {ActivationFunction} from "vscode-notebook-renderer";
import type {MarkdownIt} from "markdown-it";
import type {BlockRenderer} from "@devlooped/plotdown/browser";
import {plotdownFences} from "./fences.js";
import {renderBlocks, watchTheme} from "./webview.js";

interface MarkdownItRenderer {
  extendMarkdownIt(extend: (md: MarkdownIt) => void): void;
}

const renderers = new Map<string, BlockRenderer>();

/** Draws the blocks of the cell whose output element has this id (its HTML is in the element's shadow root). */
function drawCell(id: string): void {
  const host = document.getElementById(id);
  const root: ParentNode | null | undefined = host?.shadowRoot ?? host;
  if (!root || !root.querySelector("pre.plotdown")) {
    renderers.delete(id);
    return;
  }
  renderers.set(id, renderBlocks(root, {allowRemote: false}).renderer);
}

export const activate: ActivationFunction = async (context) => {
  const markdownIt = (await context.getRenderer("vscode.markdown-it-renderer")) as MarkdownItRenderer | undefined;
  if (!markdownIt) throw new Error("plotdown: could not load 'vscode.markdown-it-renderer'");
  watchTheme(document, () => {
    for (const renderer of renderers.values()) renderer.retheme();
  });
  markdownIt.extendMarkdownIt((md: MarkdownIt) => {
    plotdownFences(md);
    const render = md.renderer.render;
    md.renderer.render = function (tokens, options, env) {
      const html = render.call(this, tokens, options, env);
      const id = (env as {outputItem?: {id?: string}} | undefined)?.outputItem?.id;
      // The renderer sanitizes the HTML and puts it in the cell after this returns.
      if (id && tokens.some((token) => token.type === "fence")) setTimeout(() => drawCell(id), 0);
      return html;
    };
  });
};
