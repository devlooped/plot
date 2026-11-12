// The content script of every page and frame: the detector, and nothing else.
// plotdown.js (445 kB) is injected by the background only into a frame that
// holds a candidate block; other pages pay for this file and one
// MutationObserver.
import {watchForBlocks} from "./detector.js";
import {FOUND, type FoundMessage} from "./messages.js";

const MARK = "__plotdownDetector";
const scope = globalThis as typeof globalThis & {[MARK]?: boolean};

if (!scope[MARK]) {
  scope[MARK] = true;
  watchForBlocks(document, () => {
    const message: FoundMessage = {type: FOUND};
    chrome.runtime.sendMessage(message).catch(() => {
      // The extension was reloaded or removed: nothing to do.
    });
  });
}
