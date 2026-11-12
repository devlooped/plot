# VitePress

A `plot` fence in your VitePress pages becomes a chart when VitePress builds the page: the markdown-it plugin writes the chart's SVG into the HTML, so it shows with no script, and it follows VitePress's dark mode.

## Install

```sh
npm i @devlooped/plotdown linkedom
```

`linkedom` gives the plugin a document to draw in while VitePress renders in Node (`jsdom` works too).

## `.vitepress/config.mts`

```ts
import plotdown from "@devlooped/plotdown/markdown-it";
import {defineConfig} from "vitepress";

export default defineConfig({
  markdown: {
    config: (md) => md.use(plotdown)
  }
});
```

The plugin takes over only `plot`, `oplot` and `observable-plot` fences; every other fence keeps VitePress's Shiki highlighting.

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

`vitepress dev docs` (or `build`), then open the page: each block is a `<div class="plotdown">` around Plot's SVG. A block with a mistake stays code in `<div class="plotdown plotdown-error">`, with the reason in `<p class="plotdown-message">`, and the build goes on.

## Notes

- **Vue templates**: VitePress compiles each page as a Vue template. The plugin sees that (mdit-vue's `env`) and writes Plot's `<style>` as `<component is="style">` and braces as character references, so a label such as `{{ 6 * 7 }}` stays text. Force it with `md.use(plotdown, {vue: true})`.
- **Dark mode**: the chart draws with `currentColor`, so it follows VitePress's toggle.
- **Errors**: VitePress styles only its own code blocks; give `.plotdown-error pre` and `.plotdown-message` a style in your theme's CSS. `md.use(plotdown, {strict: true})` fails the build instead, and `onError: (error) => console.warn(error.message)` logs each one.
- **Titles**: a `"title"` and a `"subtitle"` become `<p class="plotdown-title">` and `<p class="plotdown-subtitle">` inside the figure, not headings, so they stay out of VitePress's outline and heading style.
- **Remote data**: markdown-it cannot wait, so a block with `{"url": …}` data fails at build time even with `allowRemote`. Put the data inline, or use `mode: "client"` and the [script tag](./script-tag.md) with `data-allow-remote`.

> [!NOTE]
> Tried with VitePress 1.6.4 (markdown-it 15.0.3) on 2026-11-12.
