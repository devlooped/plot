# React and Streamdown

A React component draws a plot block, and a ready renderer plugs it into Streamdown, so a chat that streams Markdown shows a placeholder while a block streams and the chart once its fence closes.

## Install

```sh
npm i @devlooped/plotdown
```

React 18 or later; for Streamdown, `streamdown` 2.7 or later.

## Streamdown

```jsx
import {Streamdown} from "streamdown";
import {plotRenderer} from "@devlooped/plotdown/streamdown";

const plugins = {renderers: [plotRenderer]};

<Streamdown plugins={plugins} isAnimating={streaming}>{markdown}</Streamdown>
```

The renderer takes `plot`, `oplot` and `observable-plot` blocks. A `plot` block whose text does not start with `{` (a gnuplot script) stays a Streamdown code block. For options, make one with `createPlotRenderer`:

```jsx
import {createPlotRenderer} from "@devlooped/plotdown/streamdown";

const plugins = {renderers: [createPlotRenderer({allowRemote: ["https://data.example"]})]};
```

Define `plugins` once, outside the component, so Streamdown does not see a new object on each render.

## `<Plotdown>`

For your own Markdown pipeline, or a block you hold as a string or an object:

```jsx
import {Plotdown} from "@devlooped/plotdown/react";

<Plotdown code={source} isIncomplete={streaming} />
```

| Prop | |
| --- | --- |
| `code` | The block, as text or as a parsed object |
| `isIncomplete` | Still streaming: show the placeholder, never an error |
| `placeholder` | What to show meanwhile (default: "Drawing chart…") |
| `allowRemote`, `baseUrl`, `limits`, `fetch` | Remote data, off by default |
| `onError` | Called with the `PlotdownError` of a block that fails |
| `className` | Added to the outer `div.plotdown` |

The chart is drawn in an effect, on the client: on the server and in the first paint the component holds the placeholder, so server rendering sends no chart and no mismatch. Both modules are marked `"use client"`, so a server component of the Next.js App Router can import and render them. A block that fails shows its source and the reason (`.plotdown-error`, `.plotdown-message`); the chart is removed when the component unmounts.

## Try it

Ask your model for a chart in a ```` ```plot ```` fence (the [agent skill](./agent-skill.md) teaches it the format), or paste this into a message:

````markdown
```plot
{
  "y": {"grid": true},
  "marks": [
    {"mark": "barY", "data": [{"species": "Adelie", "mass": 3750}, {"species": "Gentoo", "mass": 5000}], "x": "species", "y": "mass", "fill": "species"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```
````

The [spec](https://plotdown.cc/spec/) lists the marks and options; the [playground](https://plotdown.cc/playground/) checks a block as you type.

## Notes

- **Dark mode**: the chart draws with `currentColor`, so it follows your chat's text color.
- **Titles**: a block's `"title"` and `"subtitle"` become `<p class="plotdown-title">` and `<p class="plotdown-subtitle">` in the figure, styled inline as `plotdown.js` draws them; restyle them with those classes and `!important`.
- **Without React**: a chat UI that writes HTML can use the [script tag](./script-tag.md), which watches the page and renders a block once its JSON is complete.

> [!NOTE]
> Tried with React 19.3.1, Streamdown 2.7.1 and Vite 8.3.8 on 2026-11-12, streaming a block in Microsoft Edge 156.
