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
    // Engines word a syntax error differently, and some give no position (Node 24
    // for `[,]`) or quote the whole source: find and describe it ourselves.
    const problem = findSyntaxError(text);
    if (problem) {
      throw new PlotdownError("$", `invalid JSON: ${problem.reason}`, {...lineColumn(text, problem.position), cause: error});
    }
    const message = error instanceof Error ? error.message : String(error);
    const match = /position (\d+)/.exec(message);
    const where = match ? lineColumn(text, Number(match[1])) : {};
    const reason = message.replace(/^JSON\.parse: /, "").replace(/\s*\(line \d+ column \d+\)$/, "");
    throw new PlotdownError("$", `invalid JSON: ${reason.length > 200 ? `${reason.slice(0, 200)}…` : reason}`, {...where, cause: error});
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

/** The first syntax error of a JSON text: where it is (an offset in the text) and what is wrong. */
export interface JsonSyntaxProblem {
  position: number;
  reason: string;
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const NUMBER_PART = /[0-9.eE+-]/;
const WORD_PART = /[A-Za-z0-9_$]/;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const ESCAPES = "\"\\/bfnrt";
const MAX_SCAN_DEPTH = 512;

/**
 * Finds the first syntax error of a JSON text, by the grammar of RFC 8259.
 * Returns undefined for a text that is valid JSON.
 */
export function findSyntaxError(text: string): JsonSyntaxProblem | undefined {
  const n = text.length;
  let i = 0;
  let problem: JsonSyntaxProblem | undefined;

  const fail = (reason: string, position = i): false => {
    problem ??= {position, reason};
    return false;
  };
  const found = (): string => {
    if (i >= n) return "the end of the block";
    const c = text.charCodeAt(i);
    return c === 10 || c === 13 ? "a line break" : JSON.stringify(text[i]);
  };
  const space = (): void => {
    for (; i < n; i++) {
      const c = text.charCodeAt(i);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13) break;
    }
  };

  const string = (): boolean => {
    const start = i++; // the opening quote
    for (; i < n; i++) {
      const c = text.charCodeAt(i);
      if (c === 34) {
        i++;
        return true;
      }
      if (c < 32) {
        return fail(c === 10 || c === 13 ? "a string cannot span lines: write the line break as \\n" : "a control character in a string must be escaped");
      }
      if (c !== 92) continue;
      const e = text[++i];
      if (e === "u") {
        if (!HEX4.test(text.slice(i + 1, i + 5))) return fail("\\u must be followed by four hexadecimal digits", i - 1);
        i += 4;
      } else if (e === undefined || !ESCAPES.includes(e)) {
        return fail(`\\${e ?? ""} is not an escape of JSON`, i - 1);
      }
    }
    return fail("this string has no closing quote", start);
  };

  const value = (depth: number): boolean => {
    space();
    if (i >= n) return fail("the block ends where a value is expected");
    if (depth > MAX_SCAN_DEPTH) return fail("the block is nested too deeply");
    const c = text[i]!;
    if (c === "\"") return string();
    if (c === "{") {
      i++;
      space();
      if (text[i] === "}") {
        i++;
        return true;
      }
      for (let first = true; ; first = false) {
        space();
        if (text[i] !== "\"") {
          if (!first && text[i] === "}") return fail("a comma cannot be followed by } (no trailing commas)");
          return fail(i >= n ? "the block ends inside an object: a } is missing" : `a key must be a string in double quotes, not ${found()}`);
        }
        if (!string()) return false;
        space();
        if (text[i] !== ":") return fail(`a key must be followed by a colon, not ${found()}`);
        i++;
        if (!value(depth + 1)) return false;
        space();
        if (text[i] === "}") {
          i++;
          return true;
        }
        if (text[i] !== ",") return fail(i >= n ? "the block ends inside an object: a } is missing" : `expected a comma or } after a value, not ${found()}`);
        i++;
      }
    }
    if (c === "[") {
      i++;
      space();
      if (text[i] === "]") {
        i++;
        return true;
      }
      for (let first = true; ; first = false) {
        space();
        if (!first && text[i] === "]") return fail("a comma cannot be followed by ] (no trailing commas)");
        if (!value(depth + 1)) return false;
        space();
        if (text[i] === "]") {
          i++;
          return true;
        }
        if (text[i] !== ",") return fail(i >= n ? "the block ends inside an array: a ] is missing" : `expected a comma or ] after a value, not ${found()}`);
        i++;
      }
    }
    if (c === "-" || (c >= "0" && c <= "9")) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(text);
      const end = m ? i + m[0].length : i;
      if (!m || NUMBER_PART.test(text[end] ?? "")) {
        return fail("this is not a number of JSON (no leading zero, no leading +, a digit on each side of the point)");
      }
      i = end;
      return true;
    }
    for (const word of ["true", "false", "null"]) {
      if (text.startsWith(word, i) && !WORD_PART.test(text[i + word.length] ?? "")) {
        i += word.length;
        return true;
      }
    }
    if (c === "'") return fail("strings take double quotes, not single quotes");
    if (c === "/") return fail("JSON has no comments");
    if (c === ",") return fail("a value is missing before this comma");
    if (WORD_PART.test(c)) {
      const word = /^[A-Za-z0-9_$.]+/.exec(text.slice(i, i + 40))![0];
      return fail(`${word} is not a value of JSON: a value is a string in double quotes, a number, an object, an array, true, false or null`);
    }
    return fail(`expected a value, not ${found()}`);
  };

  if (value(0)) {
    space();
    if (i < n) fail(`expected the end of the block after its value, not ${found()}`);
  }
  return problem;
}
