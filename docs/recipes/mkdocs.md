# MkDocs

A `plot` fence in your MkDocs pages becomes a chart: a SuperFences custom fence keeps the block as plain text with its name, and `plotdown.js` draws it. It works with Material for MkDocs, its dark palette and its instant navigation.

## `mkdocs.yml`

```yaml
markdown_extensions:
  - pymdownx.highlight
  - pymdownx.superfences:
      custom_fences:
        - name: plot
          class: plot
          format: !!python/name:pymdownx.superfences.fence_code_format
        - name: oplot
          class: oplot
          format: !!python/name:pymdownx.superfences.fence_code_format
        - name: observable-plot
          class: observable-plot
          format: !!python/name:pymdownx.superfences.fence_code_format

extra_javascript:
  - path: https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js
    type: module
```

Each fence becomes `<pre class="plot"><code>…</code></pre>`, which `plotdown.js` finds. `type: module` needs MkDocs 1.5 or later; with an older MkDocs, list the classic build `https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.iife.js` as a plain string instead.

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

`mkdocs serve`, then open the page: each block shows as a chart with a Source button. A block with a mistake stays code, with the reason under it (`plotdown: unknown mark "pie" at $.marks[0].mark`).

## Notes

- **The custom fences are needed.** Without them, Pygments has no lexer for `plot` and writes `<div class="highlight"><pre><span></span><code>`, or `<div class="language-text highlight">` with `pygments_lang_class: true`: the fence name is gone, and no script can tell the block from any other code.
- **Material's palette**: under `scheme: slate` the charts are drawn dark, on the page's background.
- **Instant navigation** (`navigation.instant`) is fine: `plotdown.js` watches the page and draws the blocks of each page Material swaps in.
- **Remote data** (a `"url"` in `data`) is off. MkDocs cannot put attributes on the script tag, so set it in a script listed first: `extra_javascript: [plotdown-config.js, …]` with `globalThis.plotdownConfig = {allowRemote: ["https://data.example"]};`.
- **Python-Markdown without SuperFences** (`fenced_code`) writes `<pre><code class="language-plot">`, which works as is.

> [!NOTE]
> Tried with MkDocs 1.6.1, Material for MkDocs 9.8.1 and PyMdown Extensions 13.1 on 2026-11-12.
