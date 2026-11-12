import {JSDOM} from "jsdom";

export const BAR = `{
  "data": {"t": [{"k": "a", "v": 1}, {"k": "b", "v": 3}]},
  "marks": [{"mark": "barY", "data": "t", "x": "k", "y": "v"}]
}`;

export const BAD = `{"marks": [{"mark": "nope"}]}`;

/** A Markdown document with one block per fence name, a broken block, a gnuplot block and a JS block. */
export function sampleMarkdown(): string {
  return [
    "# Sample",
    "```plot\n" + BAR + "\n```",
    "```oplot\n" + BAR + "\n```",
    "```observable-plot title=x\n" + BAR + "\n```",
    "```plot\nplot sin(x) with lines\n```",
    "```js\nconst a = 1 < 2;\n```",
    ""
  ].join("\n\n");
}

/** Parses HTML text into a jsdom document, to query what an adapter wrote. */
export function dom(html: string): Document {
  return new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
}
