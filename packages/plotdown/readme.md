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

The parser adapters render the chart when the Markdown is converted (`mode: "inline"`, the default), with the page's document, the `document` option, or one they create from `linkedom` or `jsdom` when either is installed. `mode: "client"` leaves `<pre class="plotdown"><code class="language-plot">` for `plotdown.js`. A block that fails stays code (`language-json`) with the reason under it in `.plotdown-message`; `strict: true` throws instead, and `onError` hears of each. The rehype plugin and the marked extension (which becomes async) load data URLs when `allowRemote` allows them; markdown-it cannot wait, so such blocks fail there. Under VitePress, the markdown-it plugin writes Plot's `<style>` as `<component is="style">` and braces as character references, so Vue keeps the style and evaluates nothing (`vue: true|false` overrides the detection). A `plot` fence whose text does not start with `{` (gnuplot) stays ordinary code everywhere.

`<Plotdown>` draws on the client, in an effect: a placeholder while `isIncomplete`, the chart once the block is complete, the source and the reason when it fails; it removes the chart when unmounted. `createPlotRenderer(options)` makes a Streamdown renderer with options such as `allowRemote`.

## Safety

A block may come from anyone, or from a model. plotdown evaluates nothing: it looks up marks, transforms and options in allowlists generated from Plot's own type declarations, rejects unknown keys and strings that look like JavaScript functions, limits links to `http`, `https`, `mailto` and relative URLs, loads nothing from the network unless `allowRemote` says so, rejects CSS `url()` that could load a remote file, caps the size of a block, and checks what Plot drew.

plotdown is not affiliated with Observable, Inc.

## License

MIT
