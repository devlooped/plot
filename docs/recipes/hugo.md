# Hugo

A `plot` fence in your Hugo content becomes a chart in the browser: a code block render hook writes the block as plain text, and `plotdown.js` draws it, only on the pages that have one.

## 1. The render hooks

Hugo picks a code block render hook by the fence's language. Add one file per fence name, all with the same two lines:

- `layouts/_markup/render-codeblock-plot.html`
- `layouts/_markup/render-codeblock-oplot.html`
- `layouts/_markup/render-codeblock-observable-plot.html`

```go-html-template
{{- .Page.Store.Set "plotdown" true -}}
<pre class="{{ .Type }}"><code>{{ .Inner }}</code></pre>
```

The hook skips Chroma, so the JSON is not split into colored spans, and it marks the page as one that needs the script. Before Hugo 0.146, the folder is `layouts/_default/_markup/`.

## 2. The script

In your base template (`layouts/baseof.html`, or `layouts/_default/baseof.html` in older themes), at the end of `<body>`:

```go-html-template
{{ if .Store.Get "plotdown" }}
<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>
{{ end }}
```

It must come after `{{ .Content }}` is rendered: the hooks set the flag while the content renders. If your theme renders the content later than the place you put the script, drop the `if` and load the script on every page; it does nothing on a page without plot blocks.

## 3. Write a chart

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

The [spec](https://plotdown.cc/spec/) lists the marks and options; try a block in the [playground](https://plotdown.cc/playground/) first.

## Check it

Run `hugo server` and open the page: the block shows as a chart, with a button to see the source. A block with a mistake stays code, with the reason under it (`plotdown: unknown mark "pie" at $.marks[0].mark`). The built page holds `<pre class="plot"><code>…</code></pre>` and the script tag.

## Notes

- **Without the hook** it works too: Hugo writes `<div class="highlight"><pre class="chroma"><code class="language-plot" data-lang="plot">`, which `plotdown.js` finds. You then load the script on every page, and readers without JavaScript see colored JSON.
- **Colors** follow the page: its background and `color-scheme`, or `prefers-color-scheme`. Force them with `data-theme="light"` or `"dark"` on the script tag.
- **Remote data** (a `"url"` in `data`) is off. Allow it with `data-allow-remote="true"` or a list of origins on the script tag.
- **CSP**: the script needs no `eval` and no inline style; allow `cdn.jsdelivr.net` in `script-src`, or copy `plotdown.js` from `npm i @devlooped/plotdown` (`node_modules/@devlooped/plotdown/dist/plotdown.js`) into `static/` and use `script-src 'self'`.

> [!NOTE]
> Tried with Hugo 0.169.0 extended on 2026-11-12.
