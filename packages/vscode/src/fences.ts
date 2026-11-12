// The markdown-it plugin of the extension: it marks plot blocks for the script
// that draws them in the webview (the Markdown preview, notebook cells). It
// draws nothing itself: the extension host has no DOM, and a chart drawn in the
// webview follows the editor's theme and costs the host nothing while the user
// types.
import type {MarkdownIt, Token} from "markdown-it";
import {isPlotFence} from "@devlooped/plotdown";
import type {AllowRemote} from "@devlooped/plotdown";

/** What the host knows of the remote data of a block. */
export type Resolution =
  | {state: "ready"; text: string}
  | {state: "pending"}
  | {state: "error"; message: string};

export interface FencesOptions {
  /** The remote policy of the document, written on each block for the webview (image marks). */
  allowRemote?: (env: unknown) => AllowRemote;
  /** Remote data of a block, loaded by the host; undefined when the block needs none or may not load any. */
  resolve?: (code: string, env: unknown) => Resolution | undefined;
}

/** The class of a plot block, as written for the webview. */
export const BLOCK_CLASS = "plotdown";
/** The attribute that holds the block with its remote data inlined. */
export const RESOLVED_ATTRIBUTE = "data-plotdown-resolved";
/** The attribute that holds the remote policy: "true", or origins separated by spaces. */
export const REMOTE_ATTRIBUTE = "data-plotdown-remote";

/**
 * Whether a fence holds a plot block: a `plot` fence whose text does not start
 * with `{` is something else (a gnuplot script) and stays ordinary code.
 */
export function isPlotBlock(info: string, code: string): boolean {
  if (!isPlotFence(info)) return false;
  const word = info.trim().split(/[\s{]/, 1)[0]!.toLowerCase();
  return word !== "plot" || code.trimStart().startsWith("{");
}

/**
 * Renders plot fences as `<pre class="plotdown"><code class="language-plot">`,
 * keeping the attributes the host put on the token (VS Code's data-line and
 * code-line, for scroll sync). Other fences keep the host's rendering.
 */
export function plotdownFences(md: MarkdownIt, options: FencesOptions = {}): void {
  const previous = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, mdOptions, env, self) => {
    const token = tokens[idx]!;
    const info = md.utils.unescapeAll(token.info);
    const code = token.content;
    if (!isPlotBlock(info, code)) return previous ? previous(tokens, idx, mdOptions, env, self) : self.renderToken(tokens, idx, mdOptions);
    const escape = md.utils.escapeHtml;
    const resolution = options.resolve?.(code, env);
    const remote = options.allowRemote?.(env) ?? false;
    const source = (language: string) => `<code class="language-${language}">${escape(code)}</code>`;
    switch (resolution?.state) {
      case "pending":
        return (
          `<pre${attributes(token, "plotdown-pending", escape)}>${source("json")}</pre>\n` +
          `<p class="plotdown-message plotdown-note" role="status">plotdown: loading the data of this chart…</p>\n`
        );
      case "error":
        return (
          `<pre${attributes(token, "plotdown-failed", escape)}>${source("json")}</pre>\n` +
          `<p class="plotdown-message" role="note">plotdown: ${escape(resolution.message)}</p>\n`
        );
      default: {
        const extra: [string, string][] = [];
        if (resolution?.state === "ready") extra.push([RESOLVED_ATTRIBUTE, resolution.text]);
        if (remote) extra.push([REMOTE_ATTRIBUTE, remote === true ? "true" : remote.join(" ")]);
        return `<pre${attributes(token, BLOCK_CLASS, escape, extra)}>${source("plot")}</pre>\n`;
      }
    }
  };
}

/**
 * The attributes of the token with a class added, written without changing the
 * token: VS Code keeps the tokens of a document between renders.
 */
function attributes(token: Token, className: string, escape: (text: string) => string, extra: [string, string][] = []): string {
  const attrs = (token.attrs ?? []).filter(([name]) => name !== "class" && !name.startsWith("data-plotdown"));
  const classes = [className, ...String(token.attrGet("class") ?? "").split(/\s+/)].filter(Boolean);
  return [["class", classes.join(" ")], ...attrs, ...extra].map(([name, value]) => ` ${name}="${escape(String(value))}"`).join("");
}
