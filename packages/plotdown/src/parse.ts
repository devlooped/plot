import {PlotdownError} from "./errors.js";
import {resolveLimits, type PlotdownLimits} from "./limits.js";
import type {PlotSpec} from "./types.js";

export interface ParseOptions {
  limits?: Partial<PlotdownLimits>;
}

/**
 * Parses the text of a block as strict JSON. Throws a PlotdownError with the
 * line and column of a syntax error. Does not validate the block: see validate.
 */
export function parse(text: string, options: ParseOptions = {}): PlotSpec {
  const limits = resolveLimits(options.limits);
  if (typeof text !== "string") throw new PlotdownError("$", "the source of a plot block must be text");
  if (text.length > limits.maxSourceLength) {
    throw new PlotdownError("$", `the block is ${text.length} characters long; the limit is ${limits.maxSourceLength}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = /position (\d+)/.exec(message);
    const position = match ? Number(match[1]) : undefined;
    const where = position === undefined ? {} : lineColumn(text, position);
    const reason = message.replace(/^JSON\.parse: /, "").replace(/\s*\(line \d+ column \d+\)$/, "");
    throw new PlotdownError("$", `invalid JSON: ${reason}`, {...where, cause: error});
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlotdownError("$", "a plot block must be a JSON object, such as {\"marks\": [ … ]}");
  }
  return value as PlotSpec;
}

function lineColumn(text: string, position: number): {line: number; column: number} {
  let line = 1;
  let start = 0;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      start = i + 1;
    }
  }
  return {line, column: position - start + 1};
}
