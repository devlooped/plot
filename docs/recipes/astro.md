# Astro

A `plot` fence in your Astro Markdown becomes a chart at build time: the rehype plugin puts the chart's SVG in the page, so it shows with no script at all. Starlight works the same way.

## Install

```sh
npm i @devlooped/plotdown @astrojs/markdown-remark linkedom
```

`linkedom` gives the plugin a document to draw in at build time (`jsdom` works too). Astro 7 renders Markdown with Sätteri by default and runs `rehypePlugins` only when `@astrojs/markdown-remark` is installed; without it the build stops and says so.

## `astro.config.mjs`

```js
import {defineConfig} from "astro/config";
import rehypePlotdown from "@devlooped/plotdown/rehype";

export default defineConfig({
  markdown: {
    // Shiki runs before rehypePlugins: leave plot blocks to plotdown.
    syntaxHighlight: {type: "shiki", excludeLangs: ["plot", "oplot", "observable-plot"]},
    rehypePlugins: [rehypePlotdown]
  }
});
```

**`excludeLangs` is needed with plain Astro.** Shiki highlights code blocks before your rehype plugins run, and it has no grammar for `plot`: the block becomes `<pre class="astro-code" data-language="plaintext">`, the fence name is gone, and the plugin sees nothing.

### Starlight

Expressive Code runs after your rehype plugins, so `rehypePlugins: [rehypePlotdown]` is all it takes; no `excludeLangs`:

```js
export default defineConfig({
  integrations: [starlight({title: "My docs"})],
  markdown: {rehypePlugins: [rehypePlotdown]}
});
```

## Write a chart

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

## Check it

`astro build`, then look at the page: each block is a `<div class="plotdown">` holding Plot's `<svg>` (or a `<figure>` when the chart has a title or a legend). A block with a mistake stays code in `<div class="plotdown plotdown-error">`, with the reason in `<p class="plotdown-message">`; style that class as you like.

## Notes

- **Dark mode**: the chart draws with `currentColor`, so it follows the text color of the page, Starlight's dark theme included.
- **Titles**: a `"title"` and a `"subtitle"` become `<p class="plotdown-title">` and `<p class="plotdown-subtitle">` in the figure, not headings: Starlight does not list them under "On this page". They carry inline styles (bold, a little larger); override them with those classes and `!important`; `"caption"` is a smaller line under the chart.
- **Options**: `rehypePlugins: [[rehypePlotdown, {strict: true}]]` fails the build on a broken block; `allowRemote: true` (or a list of origins) loads data URLs at build time.
- **Client mode**: `[rehypePlotdown, {mode: "client"}]` leaves the blocks for `plotdown.js` in the browser (add its script tag to your layout), for charts that follow a theme toggle with the page's own background.

> [!NOTE]
> Tried with Astro 7.4.11 (`@astrojs/markdown-remark` 7.3.8) and Starlight 0.42.11 on 2026-11-12.
