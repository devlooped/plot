# plotdown

Render fenced `plot` blocks of strict JSON as [Observable Plot](https://observablehq.com/plot/) charts.

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

A block holds the options of `Plot.plot()` as JSON, with marks and transforms as data: `{"mark": "dot", …}` for `Plot.dot(…)`, `"transform": [{"binX": {"y": "count"}}]` for `Plot.binX(…)`. The fence is `plot`, `oplot` or `observable-plot`. The format is defined in [`spec/spec.md`](https://github.com/devlooped/plotdown/blob/main/spec/spec.md), with a JSON Schema (`@devlooped/plotdown/schema.json`).

## Usage

```js
import {render} from "@devlooped/plotdown";

const figure = render(source, {document}); // source: the block's text or a parsed object
element.append(figure);                   // an <svg>, or a <figure> with a title or a legend
```

Outside a browser, pass a jsdom or linkedom `document`.

## API

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

Every error is a `PlotdownError` whose `path` names the offending value, such as `$.marks[0].transform[0].binX.y`.

## In the browser: plotdown.js

One line renders every plot block of a page, including those added later (a streamed chat answer renders when its JSON is complete):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>
```

`dist/plotdown.js` (ESM) and `dist/plotdown.iife.js` (classic script) hold the core, Plot and d3 in one file; they need no `eval` and run under `Content-Security-Policy: script-src 'self'; style-src 'self'`. Each chart is drawn in a shadow root, before its block, with a button to show the source; a block that fails stays code with the reason under it. Colors follow the page (its background, `color-scheme`, GitHub's `data-color-mode`, `prefers-color-scheme`). It finds the markup of Markdown parsers (`pre > code.language-plot`, `pre.plot`, `pre[lang]`), of GitHub and of GitLab; the table is `SELECTORS`.

Options go on the script tag, or in `globalThis.plotdownConfig` set before it: `data-auto="false"` (do not start; call `plotdown.start()`), `data-allow-remote="true"` or a list of origins (remote data is off by default), `data-theme="light|dark"`, `data-toggle="false"`, `data-settle="3000"` (ms before a block that does not parse shows its error). The API is `globalThis.plotdown`, and for bundlers `@devlooped/plotdown/browser` (no side effects, Plot not bundled):

```ts
start(options?): Promise<ScanResult>     // render the page and watch it
stop(): void
renderAll(root?, options?): Promise<ScanResult>  // render now, once
configure(options): BrowserOptions
new BlockRenderer(options).scan(root) / .observe(root) / .disconnect()  // for other roots, such as shadow roots
```

## Safety

A block may come from anyone, or from a model. plotdown evaluates nothing: it looks up marks, transforms and options in allowlists generated from Plot's own type declarations, rejects unknown keys and strings that look like JavaScript functions, limits links to `http`, `https`, `mailto` and relative URLs, loads nothing from the network unless `allowRemote` says so, rejects CSS `url()` that could load a remote file, caps the size of a block, and checks what Plot drew.

plotdown is not affiliated with Observable, Inc.

## License

MIT
