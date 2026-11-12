// The detector: a few lines that run in every page and frame, and call back
// once, when the page holds a candidate plot block, so that only such pages
// receive plotdown.js. It takes its knowledge of where blocks are from the
// selector table of plotdown.js itself (findBlocks and SELECTORS, bundled from
// the same source), so the two cannot drift apart.
import {findBlocks, SELECTORS, type BlockSelector} from "../../plotdown/src/browser/selectors.js";

/** The attribute plotdown.js sets on a block it claimed (STATE_ATTRIBUTE of the renderer). */
const CLAIMED = "data-plotdown";
/** The attributes that can turn an element into a block: the selector table reads the fence name from them. */
const FENCE_ATTRIBUTES = ["class", "lang", "data-lang", "data-language", "data-canonical-lang"];
/** How long mutations are gathered before the added elements are searched. */
const DELAY = 100;

export interface DetectorOptions {
  /** The selector table (default: plotdown.js's own). */
  selectors?: readonly BlockSelector[];
  /** How long mutations are gathered, in ms. */
  delay?: number;
}

/**
 * Whether there is, in and under root, a block plotdown.js would take: one
 * that no other copy claimed already, and, for markup shared with another
 * language (GitHub's gnuplot), one whose text starts like JSON.
 */
export function hasCandidate(root: ParentNode, selectors: readonly BlockSelector[] = SELECTORS): boolean {
  let found;
  try {
    found = findBlocks(root, selectors);
  } catch {
    return false;
  }
  return found.some(({block, text, selector}) => {
    if (block.hasAttribute(CLAIMED) || block.parentElement?.closest(`[${CLAIMED}]`)) return false;
    return !selector.ambiguous || text.trimStart().startsWith("{");
  });
}

/**
 * Calls onFound once, as soon as the document holds a candidate block: now, or
 * when the page adds one later (a streamed chat answer, content loaded on
 * scroll). Returns a function that stops watching.
 */
export function watchForBlocks(document: Document, onFound: () => void, options: DetectorOptions = {}): () => void {
  const selectors = options.selectors ?? SELECTORS;
  const delay = options.delay ?? DELAY;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;
  const added = new Set<Element>();

  const stop = () => {
    done = true;
    observer?.disconnect();
    observer = undefined;
    clearTimeout(timer);
    added.clear();
  };
  const found = () => {
    if (done) return;
    stop();
    onFound();
  };

  if (hasCandidate(document, selectors)) {
    found();
    return stop;
  }

  // Only the elements the page adds, or whose fence attributes change, are
  // searched, at most every `delay` ms: a page that streams text into existing
  // elements costs one callback per batch and no search.
  const flush = () => {
    timer = undefined;
    const elements = Array.from(added);
    added.clear();
    // An element inside another added one is searched with it (checked for small batches only).
    const nested = elements.length <= 64 ? (element: Element) => elements.some((other) => other !== element && other.contains(element)) : () => false;
    for (const element of elements) {
      if (!element.isConnected || nested(element)) continue;
      if (hasCandidate(element, selectors)) return found();
    }
  };
  const View = document.defaultView?.MutationObserver;
  if (!View) return stop;
  observer = new View((records) => {
    for (const record of records) {
      if (record.type === "attributes") added.add(record.target as Element);
      else for (const node of Array.from(record.addedNodes)) if (node.nodeType === 1) added.add(node as Element);
    }
    if (added.size) timer ??= setTimeout(flush, delay);
  });
  observer.observe(document, {childList: true, subtree: true, attributes: true, attributeFilter: FENCE_ATTRIBUTES});
  return stop;
}
