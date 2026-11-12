import {DEFAULT_LIMITS} from "./limits.js";

/**
 * The info strings of a fenced code block that hold a plotdown block. `plot` is
 * canonical; GitHub highlights it as gnuplot, so `oplot` and `observable-plot`
 * exist for authors who mind the colors.
 */
export const FENCE_NAMES = ["plot", "oplot", "observable-plot"] as const;
export type FenceName = (typeof FENCE_NAMES)[number];

/** Whether the info string of a fence (its first word, any case) names a plot block. */
export function isPlotFence(info: string | null | undefined): boolean {
  if (!info) return false;
  const word = info.trim().split(/[\s{]/, 1)[0]!.toLowerCase();
  return (FENCE_NAMES as readonly string[]).includes(word);
}

/**
 * A cheap check that a text is a plot block rather than something else in a
 * `plot` fence (such as a gnuplot script on GitHub) or an incomplete block that
 * is still streaming: it parses as a JSON object with a `marks` array. It does
 * not validate the block.
 */
export function isPlotSpec(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length > DEFAULT_LIMITS.maxSourceLength || !trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    const value: unknown = JSON.parse(trimmed);
    return typeof value === "object" && value !== null && !Array.isArray(value) && Array.isArray((value as {marks?: unknown}).marks);
  } catch {
    return false;
  }
}
