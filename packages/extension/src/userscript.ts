// The detector of the userscript: loadPlotdown is the function that
// userscript.mjs wraps plotdown.js in.
import {watchForBlocks} from "./detector.js";

declare function loadPlotdown(): void;

watchForBlocks(document, () => loadPlotdown());
