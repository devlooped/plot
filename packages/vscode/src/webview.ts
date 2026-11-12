// What the webview scripts share (the Markdown preview, notebook Markdown cells,
// the notebook renderer): where the blocks the extension wrote are, and how to
// render them again from scratch.
import {
  BlockRenderer,
  CHART_TAG,
  ERROR_TAG,
  STATE_ATTRIBUTE,
  type AllowRemote,
  type BlockSelector,
  type BrowserOptions,
  type ScanResult
} from "@devlooped/plotdown/browser";
import {BLOCK_CLASS, REMOTE_ATTRIBUTE, RESOLVED_ATTRIBUTE} from "./fences.js";

/** The blocks the extension's markdown-it plugin wrote: `<pre class="plotdown"><code class="language-plot">`. */
export const VSCODE_SELECTORS: readonly BlockSelector[] = [
  {
    name: "vscode",
    selector: `pre.${BLOCK_CLASS} > code.language-plot`,
    block: (element) => element.parentElement,
    // The block with its remote data inlined by the host, when it loaded some.
    text: (element) => element.parentElement?.getAttribute(RESOLVED_ATTRIBUTE) ?? element.textContent
  }
];

/** The remote policy the host wrote on the blocks under root (image marks); false when none. */
export function remotePolicyOf(root: ParentNode): AllowRemote {
  const value = root.querySelector(`pre.${BLOCK_CLASS}[${REMOTE_ATTRIBUTE}]`)?.getAttribute(REMOTE_ATTRIBUTE)?.trim();
  if (!value) return false;
  if (value === "true") return true;
  const origins = value.split(/\s+/).filter((word) => /^https?:\/\//i.test(word));
  return origins.length ? origins : false;
}

/**
 * Removes what an earlier render left under root: charts, errors, the claim
 * attribute and the hidden style of blocks. The preview's own update (morphdom)
 * keeps the elements of unchanged blocks but drops what was added to them.
 */
export function clearRendered(root: ParentNode): void {
  for (const host of Array.from(root.querySelectorAll(`${CHART_TAG}, ${ERROR_TAG}`))) host.remove();
  for (const block of Array.from(root.querySelectorAll<HTMLElement>(`[${STATE_ATTRIBUTE}]`))) {
    block.removeAttribute(STATE_ATTRIBUTE);
    block.style.removeProperty("display");
    if (block.getAttribute("style") === "") block.removeAttribute("style");
  }
}

/**
 * Renders every block under root now, as complete text (a block that does not
 * parse shows its error at once). Returns the renderer, to apply a new theme.
 */
export function renderBlocks(root: ParentNode, options: BrowserOptions = {}): {renderer: BlockRenderer; done: Promise<ScanResult>} {
  clearRendered(root);
  const renderer = new BlockRenderer({
    selectors: VSCODE_SELECTORS,
    allowRemote: remotePolicyOf(root),
    ...options
  });
  return {renderer, done: renderer.scan(root, true)};
}

/** Calls retheme when the theme of the webview changes: VS Code changes the classes and the style of the body. */
export function watchTheme(document: Document, retheme: () => void): () => void {
  const view = document.defaultView;
  if (!view?.MutationObserver) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(retheme, 50);
  };
  const observer = new view.MutationObserver(schedule);
  for (const element of [document.documentElement, document.body]) {
    if (element) observer.observe(element, {attributes: true, attributeFilter: ["class", "style", "data-vscode-theme-kind", "data-vscode-theme-id"]});
  }
  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}
