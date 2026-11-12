// plotdown in the browser: find the plot blocks of a page, render them, and keep
// rendering what the page adds. This module has no side effects; plotdown.js
// (./auto.ts) is the script-tag build that starts by itself.
import {BlockRenderer, type BrowserOptions, type ScanResult} from "./renderer.js";

export * from "../index.js";
export {BlockRenderer, CHART_TAG, ERROR_TAG, STATE_ATTRIBUTE, type BrowserOptions, type ScanResult} from "./renderer.js";
export {findBlocks, readBlock, SELECTORS, type BlockSelector, type FoundBlock} from "./selectors.js";
export {detectScheme, detectTheme, type Scheme, type Theme, type ThemeOption} from "./theme.js";

let defaults: BrowserOptions = {};
let watcher: BlockRenderer | undefined;
let starting: Promise<ScanResult> | undefined;

/** Changes the options of later renders, and of the watcher if it runs. Returns the options in effect. */
export function configure(options: BrowserOptions): BrowserOptions {
  defaults = {...defaults, ...options};
  if (watcher) watcher.options = {...defaults};
  return {...defaults};
}

/**
 * Renders the plot blocks of the page and watches it, so that blocks added or
 * completed later render too. Waits until the document is parsed. Calling it
 * again changes the options and scans again; it never renders a block twice.
 */
export function start(options: BrowserOptions = {}): Promise<ScanResult> {
  configure(options);
  if (typeof document === "undefined") return Promise.resolve({rendered: 0, failed: 0, pending: 0});
  const run = () => {
    watcher ??= new BlockRenderer(defaults);
    // Observe first: a block found by the scan that is not complete yet waits for its text.
    watcher.observe(document);
    return watcher.scan(document);
  };
  if (document.readyState === "loading") {
    starting ??= new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(run()), {once: true}));
    return starting;
  }
  starting = undefined;
  return run();
}

/** Stops watching the page. Charts already drawn stay. */
export function stop(): void {
  watcher?.disconnect();
  watcher = undefined;
  starting = undefined;
}

/** Whether the page is being watched. */
export function isWatching(): boolean {
  return watcher !== undefined;
}

/**
 * Renders the plot blocks under root (default: the document) now, once, taking
 * their text as complete: a block that is not valid shows its error at once.
 * Blocks already rendered are left as they are.
 */
export function renderAll(root?: ParentNode, options?: BrowserOptions): Promise<ScanResult> {
  const target = root ?? (typeof document === "undefined" ? undefined : document);
  if (!target) return Promise.resolve({rendered: 0, failed: 0, pending: 0});
  const renderer = options || !watcher ? new BlockRenderer({...defaults, ...options}) : watcher;
  return renderer.scan(target, true);
}
