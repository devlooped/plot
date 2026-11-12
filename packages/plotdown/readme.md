# plotdown

Render fenced `plot` blocks of strict JSON as [Observable Plot](https://observablehq.com/plot/) charts: in the browser, at build time, as standalone SVG files, or as image links. Site, playground and recipes: [plotdown.cc](https://plotdown.cc).

````markdown
```plot
{
  "data": {"penguins": {"csv": "species,body_mass_g\nAdelie,3750\nGentoo,5000\nChinstrap,3500\n"}},
  "marks": [
    {"mark": "barY", "data": "penguins", "x": "species", "y": "body_mass_g", "fill": "species"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```
````

A block holds the options of `Plot.plot()` as JSON, with marks and transforms as data: `{"mark": "dot", …}` for `Plot.dot(…)`, `"transform": [{"binX": {"y": "count"}}]` for `Plot.binX(…)`. The fence is `plot`, `oplot` or `observable-plot`; a block kept in a file of its own is named `*.plotdown.json`. The format is the [spec](https://plotdown.cc/spec/), with a JSON Schema: `https://plotdown.cc/schema/plot.schema.json` (the current version), `https://plotdown.cc/schema/0.1/plot.schema.json` (spec 0.1, its `$id`), and `@devlooped/plotdown/schema.json` in this package.

```sh
npm i @devlooped/plotdown
```

| Entry | What it is for |
| --- | --- |
| `plotdown` (bin) | [The CLI](#command-line): SVG files next to the blocks of Markdown files, image links |
| `@devlooped/plotdown` | [The core](#core): `render`, `validate`, `parse`, in browsers, workers and Node |
| `@devlooped/plotdown/markdown-it`, `/rehype`, `/marked` | [Markdown parsers](#markdown-parsers-react-and-streamdown): charts at build time |
| `@devlooped/plotdown/react`, `/streamdown` | [React and Streamdown](#markdown-parsers-react-and-streamdown): charts in chat UIs |
| `@devlooped/plotdown/static` | [Standalone SVG](#standalone-svg): one SVG string with titles and legends inside |
| `@devlooped/plotdown/link` | [Image links](#image-links) to the `plotdown.cc` image service |
| `@devlooped/plotdown/browser`, `dist/plotdown.js` | [In the browser](#in-the-browser-plotdownjs): every block of a page, with one script tag |
| `dist/skills/plot`, `dist/llms.txt`, `dist/llms-full.txt` | The [agent skill](https://plotdown.cc/recipes/agent-skill/) and the guides for models |

## Command line

```sh
npx @devlooped/plotdown render "**/*.md"
```

For each block, `plotdown render` writes `docs/plots/<file>-<hash>.svg` and puts its image right after the block; a second run changes nothing, and SVG files nothing references any more are removed. `--check` changes nothing and exits with 1 when a run would change something; `--out <dir>` and `--theme auto|light|dark` set where and how; `--link` (with `--png`) puts image links to `plotdown.cc` instead of SVG files. An invalid block fails the run with its place: `readme.md:12: error: $.marks[0].mark: unknown mark "barZ"; did you mean "barX"?`.

```sh
npx @devlooped/plotdown link chart.plotdown.json       # https://plotdown.cc/svg/pako:…
npx @devlooped/plotdown link --png --scale 2 -m doc.md  # ![Title](https://plotdown.cc/png/pako:…?scale=2), one per block
```

The [GitHub Action](https://github.com/devlooped/plotdown#github-action), `devlooped/plotdown@v1`, runs `render` in a workflow. All the options: [the command line](https://plotdown.cc/recipes/cli/).

## Core

```js
import {render} from "@devlooped/plotdown";

const figure = render(source, {document}); // source: the block's text or a parsed object
element.append(figure);                   // an <svg>, or a <figure> with a title or a legend
```

Outside a browser, pass a jsdom or linkedom `document`.

```ts
render(source: string | object, options?: RenderOptions): PlotdownFigure            // sync; refuses unloaded data URLs
renderAsync(source: string | object, options?: RenderAsyncOptions): Promise<PlotdownFigure>  // loads allowed data URLs first
validate(source: string | object, options?: PlotdownOptions): PlotSpec             // checks a block, throws PlotdownError
parse(text: string, options?: ParseOptions): PlotSpec                              // strict JSON, with line and column on errors
toPlotOptions(source: string | object, options?: RenderOptions): Plot.PlotOptions  // for hosts that call Plot themselves
resolveRemoteData(source: string | object, options?: FetchOptions): Promise<PlotSpec>  // a copy with data URLs inlined

isPlotSpec(text: string): boolean     // cheap: a JSON object with a marks array (not gnuplot, not still streaming)
isPlotFence(info: string): boolean    // the fence's info string names a plot block
FENCE_NAMES                           // ["plot", "oplot", "observable-plot"]
class PlotdownError extends Error { path: string; line?: number; column?: number }

interface PlotdownOptions {
  allowRemote?: boolean | string[];   // data URLs and images from the network: false (default), true, or origins
  baseUrl?: string | URL;             // resolves relative URLs
  limits?: Partial<PlotdownLimits>;   // see DEFAULT_LIMITS
}
interface RenderOptions extends PlotdownOptions { document?: Document }
interface FetchOptions extends PlotdownOptions { fetch?: typeof fetch; signal?: AbortSignal }
```

Every error is a `PlotdownError` whose `path` names the offending value, such as `$.marks[0].transform[0].binX.y`. Where a block fails on a page, the reader sees `plotdown: <reason> at <path>`.

## Markdown parsers, React and Streamdown

Each host is a subpath export; its library is an optional peer dependency.

```js
import plotdown from "@devlooped/plotdown/markdown-it";   // VitePress, Eleventy, Marp, Slidev
md.use(plotdown);

import rehypePlotdown from "@devlooped/plotdown/rehype";  // Docusaurus, Astro, Next MDX, Nextra
rehypePlugins: [rehypePlotdown]

import plotdown from "@devlooped/plotdown/marked";
marked.use(plotdown());

import {Plotdown} from "@devlooped/plotdown/react";
<Plotdown code={source} isIncomplete={streaming} />

import {plotRenderer} from "@devlooped/plotdown/streamdown";
<Streamdown plugins={{renderers: [plotRenderer]}}>{markdown}</Streamdown>
```

The parser adapters render the chart when the Markdown is converted (`mode: "inline"`, the default), with the page's document, the `document` option, or one they create from `linkedom` (a dependency of this package) or `jsdom`. The chart's title and subtitle become `<p class="plotdown-title">` and `<p class="plotdown-subtitle">`, not headings of the page. `mode: "client"` leaves `<pre class="plotdown"><code class="language-plot">` for `plotdown.js`. A block that fails stays code (`language-json`) with the reason under it in `.plotdown-message`; `strict: true` throws instead, and `onError` hears of each. The rehype plugin and the marked extension (which becomes async) load data URLs when `allowRemote` allows them; markdown-it cannot wait, so such blocks fail there. Under VitePress, the markdown-it plugin writes Plot's `<style>` as `<component is="style">` and braces as character references, so Vue keeps the style and evaluates nothing (`vue: true|false` overrides the detection). A `plot` fence whose text does not start with `{` (gnuplot) stays ordinary code everywhere.

`<Plotdown>` draws on the client, in an effect: a placeholder while `isIncomplete`, the chart once the block is complete, the source and the reason when it fails; it removes the chart when unmounted. `createPlotRenderer(options)` makes a Streamdown renderer with options such as `allowRemote`. Both modules are marked `"use client"`, so a Next.js server component can import them.

## Standalone SVG

```js
import {parseHTML} from "linkedom";
import {renderSvg, renderStatic} from "@devlooped/plotdown/static";

const {document} = parseHTML("<!DOCTYPE html><html><body></body></html>");
const svg = renderSvg(source, {document, theme: "auto"}); // one SVG string
const {svg: same, width, height, alt} = renderStatic(source, {document});
```

For surfaces that only show images. Everything is inside the one `<svg>`: Plot's HTML titles, subtitles, captions and swatch legends are drawn again as SVG text. The output loads nothing (no remote data, no web font), carries its own colors (`theme: "auto"` follows the reader's `prefers-color-scheme`; `"light"` and `"dark"` fix them), and is deterministic: the same block gives the same bytes. It is what `plotdown render` writes and what `plotdown.cc` serves.

## Image links

```js
import {imageLink, markdownImage, parseImageLink} from "@devlooped/plotdown/link";

const url = imageLink(source, {format: "png", scale: 2}); // https://plotdown.cc/png/pako:…?scale=2
markdownImage(url, "Penguin body mass");                   // ![Penguin body mass](https://plotdown.cc/png/pako:…)
parseImageLink(url).block;                                 // the block's text again
```

A link holds the whole block (deflated, base64url), for the [image service](https://plotdown.cc/recipes/image-links/) at `https://plotdown.cc`: `format` is `svg` (default) or `png`; `theme` `auto` (SVG only), `light` or `dark`; `scale` 1 to 4 (PNG only); `baseUrl` for a service of your own. A link longer than 8,000 characters throws a `LinkTooLongError`. The module imports nothing and runs in Node and in browsers.

## In the browser: plotdown.js

One line renders every plot block of a page, including those added later (a streamed chat answer renders when its JSON is complete):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>
```

`dist/plotdown.js` (ESM) and `dist/plotdown.iife.js` (classic script) hold the core, Plot and d3 in one file; they need no `eval` and run under `Content-Security-Policy: script-src 'self'; style-src 'self'`. Each chart is drawn in a shadow root, before its block, with a button to show the source; a block that fails stays code with the reason under it. Colors follow the page (its background, `color-scheme`, GitHub's `data-color-mode`, `prefers-color-scheme`). It finds the markup of Markdown parsers (`pre > code.language-plot`, `pre.plot`, `pre[lang]`), of GitHub, GitLab, Gitea, Forgejo, Bitbucket, Azure DevOps, ChatGPT, Claude and Gemini; the table is `SELECTORS`. Where a site drops the fence name, a block renders only when its text is a plot spec.

Options go on the script tag, or in `globalThis.plotdownConfig` set before it: `data-auto="false"` (do not start; call `plotdown.start()`), `data-allow-remote="true"` or a list of origins (remote data is off by default), `data-theme="light|dark"`, `data-toggle="false"` (no Source button), `data-copy="false"` (no Copy button, whose menu copies the block as JSON or the chart as PNG or SVG), `data-settle="3000"` (ms before a block that does not parse shows its error). The API is `globalThis.plotdown`, and for bundlers `@devlooped/plotdown/browser` (no side effects, Plot not bundled):

```ts
start(options?): Promise<ScanResult>     // render the page and watch it
stop(): void
renderAll(root?, options?): Promise<ScanResult>  // render now, once
configure(options): BrowserOptions
new BlockRenderer(options).scan(root) / .observe(root) / .disconnect()  // for other roots, such as shadow roots
```

## Safety

A block may come from anyone, or from a model. plotdown evaluates nothing: it looks up marks, transforms and options in allowlists generated from Plot's own type declarations, rejects unknown keys and strings that look like JavaScript functions, limits links to `http`, `https`, `mailto` and relative URLs, loads nothing from the network unless `allowRemote` says so, rejects CSS `url()` that could load a remote file, caps the size of a block, and checks what Plot drew.

plotdown is not affiliated with Observable, Inc. Observable Plot is © Observable, Inc., under the ISC license.

## License

MIT
