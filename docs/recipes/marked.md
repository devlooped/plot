# marked

A marked extension turns `plot` fences into charts when the Markdown is converted, as inline SVG.

## Install and use

```sh
npm i @devlooped/plotdown marked linkedom
```

```js
import {marked} from "marked";
import plotdown from "@devlooped/plotdown/marked";

marked.use(plotdown());
const html = marked.parse(source);
```

In Node, `linkedom` (or `jsdom`) gives the extension a document to draw in; in a browser it uses the page's.

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

## Options

```js
marked.use(plotdown({
  allowRemote: ["https://data.example"],   // makes the extension async
  mode: "inline",                          // or "client": leave the blocks for plotdown.js
  strict: false,                           // true: throw on a broken block
  onError: (error) => console.warn(`${error.path}: ${error.message}`)
}));
```

**With `allowRemote`, the extension is async**: it loads the data of each block before rendering, and `marked.parse` returns a promise, so `await` it. Without `allowRemote`, `parse` stays synchronous and a block with `{"url": …}` data fails.

A block that fails stays code (`<div class="plotdown plotdown-error">`) with the reason in `<p class="plotdown-message">`. Indented code blocks are left alone; only fences count.

## Notes

- Use `new Marked(plotdown())` for an instance of its own instead of changing the global `marked`.
- **Dark mode**: the inline chart draws with `currentColor` and follows the page's text color.
- With `mode: "client"`, add the [script tag](./script-tag.md) to the page.

> [!NOTE]
> Tried with marked 18.2.0 in Node 24 on 2026-11-12, sync and async with remote data.
