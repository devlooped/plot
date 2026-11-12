# Docsify

A `plot` fence in your Docsify pages becomes a chart, with one script tag and no plugin: Docsify writes the fence as `<pre data-lang="plot"><code class="lang-plot">`, and `plotdown.js` finds it each time Docsify renders a page.

## `index.html`

Add the script after Docsify's:

```html
<script>
  window.$docsify = {name: "My docs"};
</script>
<script src="https://cdn.jsdelivr.net/npm/docsify@5/dist/docsify.min.js"></script>
<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>
```

No `doneEach` hook is needed: `plotdown.js` watches the page, so the blocks of each route render as Docsify swaps the content in, on the first load and on every link.

## Write a chart

In any `.md` page:

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

`oplot` and `observable-plot` fences work too. The [spec](https://plotdown.cc/spec/) lists the marks and options; the [playground](https://plotdown.cc/playground/) shows a block as you write it.

## Check it

Serve the folder (`npx docsify-cli serve .`, or any static server) and open the page: each block shows as a chart with a Source button. A block with a mistake stays code, with the reason under it (`plotdown: unknown mark "pie" at $.marks[0].mark`).

## Notes

- **Prism** leaves the block alone: it has no grammar for `plot`, and `plotdown.js` reads the text, not the spans.
- **Dark themes**: the charts take the page's background and `color-scheme`; with a dark Docsify theme they are drawn dark. Force one with `data-theme="light"` or `"dark"` on the script tag.
- **Remote data** (a `"url"` in `data`) is off; allow it with `data-allow-remote="true"` or a list of origins on the script tag.
- **Docsify 4** writes the same markup; use `docsify@4/lib/docsify.min.js` there.
- On a case-insensitive file system, `README.md` (Docsify's home page) and a `readme.md` of your own are one file; set `homepage: "home.md"` in `$docsify` if you need both.

> [!NOTE]
> Tried with Docsify 5.1.0, and Docsify 4 with its dark theme, on 2026-11-12.
