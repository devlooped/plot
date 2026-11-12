// JSON syntax errors: the line, the column and a reason in our own words,
// whatever the engine's message says (Node 24 gives no position for `[,]`).
import {readdirSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {PlotdownError} from "../src/errors.js";
import {findSyntaxError, parse} from "../src/parse.js";

function problem(text: string): PlotdownError {
  try {
    parse(text);
  } catch (error) {
    return error as PlotdownError;
  }
  throw new Error("parse did not throw");
}

describe("JSON syntax errors", () => {
  const cases: [text: string, line: number, column: number, reason: RegExp][] = [
    ['{"marks": [,]}', 1, 12, /a value is missing before this comma/],
    ['{"marks": [1,]}', 1, 14, /no trailing commas/],
    ['{"a": 1,}', 1, 9, /no trailing commas/],
    ["{'a': 1}", 1, 2, /a key must be a string in double quotes, not "'"/],
    ['{"a": \'x\'}', 1, 7, /double quotes, not single quotes/],
    ["{a: 1}", 1, 2, /a key must be a string in double quotes/],
    ['{"a" 1}', 1, 6, /followed by a colon/],
    ['{"a": 01}', 1, 7, /not a number of JSON/],
    ['{"a": 1.}', 1, 7, /not a number of JSON/],
    ['{"a": -}', 1, 7, /not a number of JSON/],
    ['{"a": 1 // why\n}', 1, 9, /expected a comma or \} after a value, not "\/"/],
    ['{"a": /* why */ 1}', 1, 7, /JSON has no comments/],
    ['{"a": "x\ny"}', 1, 9, /a string cannot span lines/],
    ['{"a": "\\q"}', 1, 8, /\\q is not an escape of JSON/],
    ['{"a": "\\u12"}', 1, 8, /four hexadecimal digits/],
    ['{"a": "x', 1, 7, /no closing quote/],
    ['{"a": tru}', 1, 7, /tru is not a value of JSON/],
    ['{"a": undefined}', 1, 7, /undefined is not a value of JSON/],
    ['{"a": NaN}', 1, 7, /NaN is not a value of JSON/],
    ['{"a": d3.format(".0%")}', 1, 7, /d3\.format is not a value of JSON/],
    ['{"a": 1} x', 1, 10, /expected the end of the block/],
    ['{"a": [1, 2', 1, 12, /a \] is missing/],
    ['{"a": 1', 1, 8, /a \} is missing/],
    ["", 1, 1, /the block ends where a value is expected/],
    ['{\n  "marks": [\n    {"mark": "dot",}\n  ]\n}', 3, 20, /no trailing commas/],
    ['{\r\n  "marks": [\r\n    {"mark": "dot",}\r\n  ]\r\n}', 3, 20, /no trailing commas/]
  ];

  for (const [text, line, column, reason] of cases) {
    it(`locates ${JSON.stringify(text).slice(0, 40)}`, () => {
      const error = problem(text);
      expect(error).toBeInstanceOf(PlotdownError);
      expect(error.message).toMatch(/^invalid JSON: /);
      expect(error.message).toMatch(reason);
      expect([error.line, error.column]).toEqual([line, column]);
    });
  }

  it("does not quote the whole block in the message", () => {
    const text = `{"marks": [${'{"mark": "dot"},'.repeat(200)}]}`;
    expect(problem(text).message.length).toBeLessThan(120);
  });

  it("stops at a nesting no block needs, without overflowing the stack", () => {
    expect(problem("[".repeat(100_000)).message).toMatch(/nested too deeply|invalid JSON/);
  });

  it("accepts what JSON accepts", () => {
    for (const text of ['{"a": "é \\u00e9 \\n \\" \\/"}', "[]", "{}", ' \t\r\n{"a": [1, -0.5e+3, true, false, null, {"b": []}]} \n', '"text"', "0", "-1.5E-2"]) {
      expect(findSyntaxError(text), text).toBeUndefined();
    }
  });

  // The locator must agree with JSON.parse on what is valid: try every fixture
  // and thousands of one-character mutations of them (fixed seed).
  it("agrees with JSON.parse on mutated fixtures", () => {
    const dir = fileURLToPath(new URL("../../../spec/fixtures/", import.meta.url));
    let seed = 20261112;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const inserts = '",:{}[]0-e.\'/t\n\\ +x';
    let tried = 0;
    for (const file of readdirSync(dir)) {
      const text = readFileSync(dir + file, "utf8");
      expect(findSyntaxError(text), file).toBeUndefined();
      for (let k = 0; k < 200; k++) {
        const at = Math.floor(random() * text.length);
        const mutated =
          random() < 0.5 ? text.slice(0, at) + text.slice(at + 1) : text.slice(0, at) + inserts[Math.floor(random() * inserts.length)] + text.slice(at);
        let valid = true;
        try {
          JSON.parse(mutated);
        } catch {
          valid = false;
        }
        const found = findSyntaxError(mutated);
        if (valid !== (found === undefined)) {
          throw new Error(`${file}: JSON.parse says ${valid ? "valid" : "invalid"}, the locator says ${JSON.stringify(found)} near ${JSON.stringify(mutated.slice(Math.max(0, at - 20), at + 20))}`);
        }
        tried++;
      }
    }
    expect(tried).toBeGreaterThan(5000);
  });
});
