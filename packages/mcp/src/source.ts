// Normalizes what a model passes as a plot block: a JSON object, its JSON text,
// or that text inside a Markdown fence. Shared by the server and the view.
import {isPlotFence} from "@devlooped/plotdown";

/** A plot block as the tool receives it. */
export type PlotInput = string | Record<string, unknown>;

const FENCE = /^\s*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n?\s*\1\s*$/;

/**
 * Returns the text of the block to hand to the core: a string as is (without a
 * surrounding ```plot, ```oplot, ```observable-plot or ```json fence), an object as
 * its JSON text. Text keeps the line and column of JSON syntax errors.
 */
export function toSourceText(input: PlotInput): string {
  if (typeof input !== "string") return JSON.stringify(input, null, 2);
  const match = FENCE.exec(input);
  if (match) {
    const info = (match[2] ?? "").trim();
    if (info === "" || isPlotFence(info) || /^json\b/i.test(info)) return match[3] ?? "";
  }
  return input;
}

/** The block as a Markdown fence, for copying into a document. */
export function toFence(text: string): string {
  return "```plot\n" + text.trim() + "\n```";
}
