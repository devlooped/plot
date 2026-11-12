// The Markdown preview script (markdown.previewScripts): draws the blocks the
// markdown-it plugin marked, when the preview loads and each time it updates.
//
// The preview updates its content in place (morphdom) as the user types and
// then fires "vscode.markdown.updateContent": every block is drawn again from
// what the update left, rather than watched with a MutationObserver, which
// would race with the update. Drawing takes no network (the host inlines remote
// data), so it finishes in microtasks, before the next paint: no flicker.
import type {BlockRenderer} from "@devlooped/plotdown/browser";
import {renderBlocks, watchTheme} from "./webview.js";

let current: BlockRenderer | undefined;

export function refresh(): void {
  const root = document.querySelector(".markdown-body") ?? document.body;
  if (!root) return;
  current = renderBlocks(root).renderer;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("vscode.markdown.updateContent", refresh);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, {once: true});
  else refresh();
  const start = () => watchTheme(document, () => current?.retheme());
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, {once: true});
}
