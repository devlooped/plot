// The notebook renderer of the plotdown MIME type: a cell output of type
// application/vnd.plotdown+json holds a plot block (its JSON), and draws as a
// chart, with the source behind a button and the error when it fails. A kernel
// produces it, such as IPython:
//
//   from IPython.display import display
//   display({"application/vnd.plotdown+json": spec, "text/plain": "…"}, raw=True)
//
// Remote data is off, as in Markdown cells.
import type {ActivationFunction} from "vscode-notebook-renderer";
import type {BlockRenderer} from "@devlooped/plotdown/browser";
import {BLOCK_CLASS} from "./fences.js";
import {renderBlocks, watchTheme} from "./webview.js";

/** The MIME type of a plot block in a notebook output. */
export const PLOTDOWN_MIME = "application/vnd.plotdown+json";

const renderers = new Map<string, BlockRenderer>();

export const activate: ActivationFunction = () => {
  watchTheme(document, () => {
    for (const renderer of renderers.values()) renderer.retheme();
  });
  return {
    renderOutputItem(item, element) {
      let text = item.text();
      try {
        // A kernel may write the block as a JSON string rather than an object.
        const value: unknown = JSON.parse(text);
        if (typeof value === "string") text = value;
        else text = JSON.stringify(value, null, 2);
      } catch {
        // Not JSON: rendered as is, so the error says where it breaks.
      }
      const pre = document.createElement("pre");
      pre.className = BLOCK_CLASS;
      const code = document.createElement("code");
      code.className = "language-plot";
      code.textContent = text;
      pre.append(code);
      pre.style.whiteSpace = "pre-wrap";
      element.replaceChildren(pre);
      renderers.set(item.id, renderBlocks(element, {allowRemote: false}).renderer);
    },
    disposeOutputItem(id) {
      if (id === undefined) renderers.clear();
      else renderers.delete(id);
    }
  };
};
