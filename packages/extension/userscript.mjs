// The userscript: plotdown.js under a userscript header, for Tampermonkey,
// Violentmonkey and Greasemonkey. A userscript cannot load a file on demand as
// the extension does, so plotdown.js is wrapped in a function that the same
// detector calls only when the page has a candidate block: other pages parse
// the file but never run it (Plot and d3 are not even initialized).

/**
 * @param {{version: string, detector: string, plotdown: string}} parts
 *   detector: the bundled detector (src/userscript.ts), which calls loadPlotdown();
 *   plotdown: the text of dist/plotdown.iife.js.
 * @returns {string}
 */
export function createUserscript({version, detector, plotdown}) {
  const header = [
    "// ==UserScript==",
    "// @name         plotdown",
    "// @namespace    https://github.com/devlooped/plotdown",
    `// @version      ${version}`,
    "// @description  Renders plot, oplot and observable-plot code blocks of JSON as Observable Plot charts on every site. Remote data stays off.",
    "// @author       devlooped",
    "// @license      MIT",
    "// @homepageURL  https://github.com/devlooped/plotdown",
    "// @supportURL   https://github.com/devlooped/plotdown/issues",
    "// @match        *://*/*",
    "// @grant        none",
    "// @run-at       document-idle",
    "// ==/UserScript=="
  ].join("\n");
  return `${header}

(function () {
  function loadPlotdown() {
    // A page that loads plotdown.js itself renders its own blocks.
    if (globalThis.plotdown) return;
    globalThis.plotdownConfig = Object.assign({}, globalThis.plotdownConfig, {auto: true, allowRemote: false});
${stripSourceMap(plotdown).trim()}
  }
${detector.trim()}
})();
`;
}

/** The text of a bundle without its source map comment (the map is not shipped). */
export function stripSourceMap(code) {
  return code.replace(/\r?\n?\/\/# sourceMappingURL=\S+\s*$/, "\n");
}
