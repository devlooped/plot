// What an invalid request gets where its image would be: an image that says
// why. A README shows a broken-image icon for a body it cannot decode, which
// tells the author nothing; an SVG or a PNG that reads "$.data.d.url: … would
// load from the network" tells them what to fix, on the page itself. Scripts
// that ask for JSON (Accept: application/json) get JSON instead. The status is
// the error's either way (400, 413, 422…), so tools and caches see a failure.
import type {ServiceErrorInfo} from "./render.js";

const WIDTH = 640;
const PADDING = 16;
const FONT = 13;
const LINE = 18;
/** Characters per line: a sans-serif averages about 0.55 em a character. */
const COLUMNS = Math.floor((WIDTH - 2 * PADDING) / (FONT * 0.55));

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]!);
}

/** Splits a text into lines of at most `columns` characters, at spaces where it can. */
export function wrap(text: string, columns = COLUMNS): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (rest.length > columns) {
        if (line) lines.push(line);
        lines.push(rest.slice(0, columns));
        rest = rest.slice(columns);
        line = "";
      }
      const candidate = line ? `${line} ${rest}` : rest;
      if (candidate.length > columns) {
        lines.push(line);
        line = rest;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines.slice(0, 12);
}

/** The error as a small standalone SVG, in the reader's color scheme (or a fixed one, for a PNG). */
export function errorSvg(error: ServiceErrorInfo, theme: "auto" | "light" | "dark" = "auto"): string {
  const title = error.status === 400 && error.code === "invalid-block" ? "This plot block cannot be drawn" : "No chart: the request was refused";
  const where = [error.path, error.line !== undefined ? `line ${error.line}${error.column !== undefined ? `, column ${error.column}` : ""}` : undefined].filter(Boolean).join(" · ");
  const lines = [...(where ? [where] : []), ...wrap(error.message)];
  const height = PADDING * 2 + 22 + lines.length * LINE + 24;
  const light = ".e{color:#1f2328}.bg{fill:#fff8f7;stroke:#d1242f}.m{fill:#59636e}";
  const dark = ".e{color:#f0f6fc}.bg{fill:#1c1214;stroke:#f85149}.m{fill:#9198a1}";
  const style = theme === "auto" ? `${light}@media (prefers-color-scheme:dark){${dark}}` : theme === "dark" ? dark : light;
  const text = lines
    .map((line, i) => `<text x="${PADDING}" y="${PADDING + 44 + i * LINE}"${i === 0 && where ? ' font-family="ui-monospace, monospace"' : ""}>${escape(line)}</text>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="e" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escape(`${title}: ${error.message}`)}" font-family="system-ui, sans-serif" font-size="${FONT}">` +
    `<style>${style}</style>` +
    `<rect class="bg" x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="6"/>` +
    `<text x="${PADDING}" y="${PADDING + 16}" font-size="15" font-weight="600" fill="currentColor">${escape(title)}</text>` +
    `<g fill="currentColor">${text}</g>` +
    `<text class="m" x="${PADDING}" y="${height - PADDING}" font-size="11">plotdown · ${error.status} ${escape(error.code)}</text>` +
    `</svg>\n`
  );
}
