# markdown-it

A markdown-it plugin turns `plot` fences into charts when the Markdown is converted: the HTML holds Plot's SVG and needs no script. It is what [VitePress](./vitepress.md) uses, and it fits Eleventy, Marp, Slidev and any tool built on markdown-it.

## Install and use

```sh
npm i @devlooped/plotdown markdown-it linkedom
```

```js
import MarkdownIt from "markdown-it";
import plotdown from "@devlooped/plotdown/markdown-it";

const md = new MarkdownIt().use(plotdown);
const html = md.render(source);
```

In Node, the plugin draws in a document from `linkedom` (or `jsdom`) when either is installed, or in the one you pass as `document`. In a browser it uses the page's.

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
md.use(plotdown, {
  mode: "inline",            // or "client": leave <pre class="plotdown"><code class="language-plot"> for plotdown.js
  strict: false,             // true: throw on a broken block, so the build fails
  onError: (error, code) => console.warn(`${error.path}: ${error.message}`),
  vue: undefined,            // true/false forces the Vue-safe output; detected under mdit-vue (VitePress)
  document: undefined        // a Document, or a function that returns one
});
```

Other fences keep the host's rendering and highlighting. A block that fails stays code (`<div class="plotdown plotdown-error"><pre><code class="language-json">`) with the reason in `<p class="plotdown-message">`. With `mode: "client"`, add the [script tag](./script-tag.md) to the page.

## In other tools

These follow each tool's plugin hook; they were not tried:

- **Eleventy**: `eleventyConfig.amendLibrary("md", (md) => md.use(plotdown));`
- **Marp**: in `marp.config.mjs`, `engine: ({marp}) => marp.use(plotdown)`.
- **Slidev**: in `vite.config.ts`, `slidev({markdown: {markdownItSetup: (md) => md.use(plotdown)}})`.

## Notes

- **Remote data**: markdown-it renders synchronously, so a block with `{"url": …}` data fails even with `allowRemote`. Use the [rehype plugin](./rehype.md) or [marked](./marked.md), or `mode: "client"`.
- **Dark mode**: the inline chart draws with `currentColor` and follows the page's text color.

> [!NOTE]
> Tried with markdown-it 15.0.3 in Node 24 on 2026-11-12, inline and client modes.
