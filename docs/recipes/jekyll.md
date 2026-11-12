# Jekyll and GitHub Pages

A `plot` fence in a Jekyll site becomes a chart, on GitHub Pages' default build too: kramdown writes the fence as `<pre><code class="language-plot">`, and one script tag in the layout draws it. No plugin, so it works where GitHub Pages allows none.

## The script

With a GitHub Pages theme (Primer, the default, and the other `pages-themes` such as Cayman or Minimal), add `_includes/head-custom.html`; the theme's layout includes it in `<head>`:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>
```

With your own layout, put the same line in `_layouts/default.html`, in `<head>` or before `</body>`. With Minima 3, the hook is `_includes/custom-head.html`; Minima 2 has none, so copy its `_includes/head.html` into your site and add the line there.

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

`oplot` and `observable-plot` fences work too. The [spec](https://plotdown.cc/spec/) lists the marks and options; the [playground](https://plotdown.cc/playground/) checks a block as you type.

## Check it

Push, or build locally (`bundle exec jekyll serve` with `gem "github-pages"` in the `Gemfile`), and open the page: each block shows as a chart with a Source button. A block with a mistake stays code, with the reason under it (`plotdown: unknown mark "pie" at $.marks[0].mark`).

## Notes

- **Rouge** has no lexer for `plot`, so kramdown leaves the block as plain `<pre><code class="language-plot">` rather than `<div class="language-plot highlighter-rouge">`; `plotdown.js` finds either.
- **Liquid**: a block with `{{` or `{%` in a string (a title, a label) is read as Liquid first. Wrap it in `{% raw %}` … `{% endraw %}`.
- **Building locally** with the `github-pages` gem outside a clone of the repository fails with "No repo name found": set `PAGES_REPO_NWO=owner/repo` (GitHub sets it for you).
- **Colors** follow the page's background and `color-scheme`; force them with `data-theme="light"` or `"dark"` on the script tag.
- **Remote data** (a `"url"` in `data`) is off; allow it with `data-allow-remote="true"` or a list of origins on the script tag.

> [!NOTE]
> Tried with Jekyll 3.10.0 (`github-pages` gem: kramdown 2.4.0, Rouge 3.30.0, Primer theme) on 2026-11-12.
