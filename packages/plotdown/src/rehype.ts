// @devlooped/plotdown/rehype: a rehype plugin that turns plot blocks into charts
// (Docusaurus, Astro/Starlight, Next MDX, Nextra, any unified pipeline).
import type {Element, ElementContent, Nodes, Parents, Root} from "hast";
import {fromDom} from "hast-util-from-dom";
import {errorText, renderBlockAsync, type PlotdownAdapterOptions} from "./adapter.js";
import {isPlotFence} from "./fences.js";

export type {PlotdownAdapterOptions} from "./adapter.js";
export type RehypePlotdownOptions = PlotdownAdapterOptions;

/** The part of a vfile the plugin uses: warnings for blocks that fail. */
interface FileLike {
  message(reason: string, place?: unknown): unknown;
}

/**
 * Turns `<pre><code class="language-plot">` (and `oplot`, `observable-plot`),
 * as remark-rehype writes fenced blocks, into charts:
 *
 * ```js
 * unified().use(remarkParse).use(remarkRehype).use(rehypePlotdown).use(rehypeStringify)
 * ```
 *
 * Inline mode (the default) puts the chart in the tree at build time, as hast
 * elements, so MDX hosts work too. Client mode leaves `<pre class="plotdown"><code
 * class="language-plot">` for `plotdown.js`. A failing block stays code with the
 * reason under it, and a warning on the file; `strict: true` fails the build.
 * The plugin is async, so data URLs load when `allowRemote` allows them.
 */
export default function rehypePlotdown(options: RehypePlotdownOptions = {}) {
  return async function transform(tree: Root, file?: FileLike): Promise<void> {
    const blocks: {parent: Parents; index: number; pre: Element; lang: string; code: string}[] = [];
    collect(tree, (parent, index, pre) => {
      const code = pre.children.find((child): child is Element => child.type === "element" && child.tagName === "code");
      if (!code) return;
      const lang = languageOf(code);
      if (lang && isPlotFence(lang)) blocks.push({parent, index, pre, lang, code: textOf(code)});
    });
    // Replace from the end, so the indexes of earlier blocks stay right.
    for (const block of blocks.reverse()) {
      const result = await renderBlockAsync(block.lang, block.code, options);
      let replacement: Element;
      switch (result.kind) {
        case "skip":
          continue;
        case "chart":
          replacement = element("div", {className: ["plotdown"]}, [fromDom(result.figure) as ElementContent]);
          break;
        case "client":
          replacement = element("pre", {className: ["plotdown"]}, [element("code", {className: ["language-plot"]}, [{type: "text", value: block.code}])]);
          break;
        case "error": {
          const text = errorText(result.error);
          file?.message(text, block.pre.position);
          replacement = element("div", {className: ["plotdown", "plotdown-error"]}, [
            element("pre", {}, [element("code", {className: ["language-json"]}, [{type: "text", value: block.code}])]),
            element("p", {className: ["plotdown-message"], role: "note"}, [{type: "text", value: text}])
          ]);
          break;
        }
      }
      if (block.pre.position) replacement.position = block.pre.position;
      block.parent.children[block.index] = replacement;
    }
  };
}

export {rehypePlotdown};

function collect(node: Nodes, found: (parent: Parents, index: number, pre: Element) => void): void {
  if (!("children" in node)) return;
  node.children.forEach((child, index) => {
    if (child.type === "element" && child.tagName === "pre") found(node, index, child);
    else collect(child, found);
  });
}

function languageOf(code: Element): string | undefined {
  const className: unknown = code.properties.className;
  const classes = Array.isArray(className) ? className.map(String) : typeof className === "string" ? className.split(/\s+/) : [];
  return classes.find((name: string) => name.startsWith("language-"))?.slice("language-".length);
}

function textOf(node: Nodes): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map((child) => textOf(child)).join("") : "";
}

function element(tagName: string, properties: Element["properties"], children: ElementContent[]): Element {
  return {type: "element", tagName, properties, children};
}
