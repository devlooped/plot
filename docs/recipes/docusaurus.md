# Docusaurus

A `plot` fence in your Docusaurus docs becomes a chart at build time: the rehype plugin turns the block into Plot's SVG inside the MDX tree, so it is in the HTML of the page and hydrates with no extra script.

## Install

```sh
npm i @devlooped/plotdown linkedom
```

`linkedom` gives the plugin a document to draw in while Docusaurus builds in Node (`jsdom` works too).

## `docusaurus.config.mjs`

```js
import rehypePlotdown from "@devlooped/plotdown/rehype";

export default {
  presets: [
    [
      "classic",
      {
        docs: {
          rehypePlugins: [rehypePlotdown]
        },
        blog: {
          rehypePlugins: [rehypePlotdown]   // if your blog has charts too
        }
      }
    ]
  ]
};
```

Use `rehypePlugins`, not `beforeDefaultRehypePlugins`. Docusaurus does not highlight at build time: Prism colors code blocks in the browser, through the theme's `CodeBlock` component. By then a plot block is already a chart, so the order does not matter, and the code of a failing block is highlighted as JSON.

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

`docusaurus start` (or `build` then `serve`), then open the page: each block is a `<div class="plotdown">` around Plot's SVG. A block with a mistake stays code, with the reason in `<p class="plotdown-message">`, and the build goes on.

## Notes

- **Dark mode**: the chart draws with `currentColor`, so it follows Docusaurus's toggle.
- **Figures**: a chart with a title or a legend is a `<figure>`, which keeps the browser's default side margins; `.plotdown figure { margin: 0; }` in `custom.css` lines it up with the text.
- **Errors**: `[rehypePlotdown, {strict: true}]` fails the build on a broken block; give `.plotdown-message` a style in `custom.css`.
- **Remote data**: the plugin is async, so `[rehypePlotdown, {allowRemote: ["https://data.example"]}]` loads `{"url": …}` data at build time.
- **Pages** (`src/pages/*.md`) take the same option under `pages: {rehypePlugins: […]}`.

> [!NOTE]
> Tried with Docusaurus 3.10.2 on 2026-11-12.
