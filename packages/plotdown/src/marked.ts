// @devlooped/plotdown/marked: a marked extension that turns plot blocks into charts.
import type {MarkedExtension, Token, Tokens} from "marked";
import {blockHtml, renderBlock, renderBlockAsync, type BlockResult, type PlotdownAdapterOptions} from "./adapter.js";

export type {PlotdownAdapterOptions} from "./adapter.js";
export type PlotdownMarkedOptions = PlotdownAdapterOptions;

/**
 * Renders fenced `plot`, `oplot` and `observable-plot` blocks as charts:
 *
 * ```js
 * import {marked} from "marked";
 * import plotdown from "@devlooped/plotdown/marked";
 * marked.use(plotdown());
 * ```
 *
 * With `allowRemote`, the extension is async (it loads data URLs first), so
 * `marked.parse` returns a promise.
 */
export default function plotdown(options: PlotdownMarkedOptions = {}): MarkedExtension {
  const loaded = new WeakMap<Token, BlockResult>();
  const extension: MarkedExtension = {
    renderer: {
      code(token: Tokens.Code): string | false {
        if (token.codeBlockStyle === "indented") return false;
        const result = loaded.get(token) ?? renderBlock(token.lang, token.text, options);
        return result.kind === "skip" ? false : blockHtml(result, token.text);
      }
    }
  };
  if (options.allowRemote && options.mode !== "client") {
    extension.async = true;
    extension.walkTokens = async (token: Token) => {
      if (token.type !== "code" || (token as Tokens.Code).codeBlockStyle === "indented") return;
      const code = token as Tokens.Code;
      loaded.set(token, await renderBlockAsync(code.lang, code.text, options));
    };
  }
  return extension;
}

export {plotdown};
