# mdBook

A `plot` fence in a chapter becomes a chart in the book: mdBook writes the fence as `<pre><code class="language-plot">`, and `plotdown.js` finds and draws it.

## The script

Add `theme/head.hbs` next to `book.toml`; mdBook puts it in the `<head>` of every page:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>
```

That is all: no preprocessor, no change to `book.toml`.

### Or with `additional-js`

For a book that works offline, take the classic build from the package (`npm i @devlooped/plotdown`, then `node_modules/@devlooped/plotdown/dist/plotdown.iife.js`) or from `https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.iife.js`, save it next to `book.toml`, and list it:

```toml
[output.html]
additional-js = ["plotdown.iife.js"]
```

mdBook copies it with a hash in its name and loads it at the end of each page. Use the `.iife.js` file here: `additional-js` writes a classic `<script>`, and the ESM build needs `type="module"`.

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

`oplot` and `observable-plot` fences work the same. The [spec](https://plotdown.cc/spec/) lists the marks and options, and the [playground](https://plotdown.cc/playground/) shows a block as you type.

## Check it

`mdbook serve --open`, then open the chapter: each block shows as a chart with a Source button. A block with a mistake stays code, with the reason under it (`plotdown: unknown mark "pie" at $.marks[0].mark`).

## Notes

- **Themes**: the charts take the colors of the book's theme. Under Coal, Navy or Ayu they are drawn dark, on the theme's background.
- **highlight.js** leaves the block alone: mdBook has no grammar for `plot`, and `plotdown.js` reads the text, not the spans.
- **Remote data** (a `"url"` in `data`) is off. Allow it with `data-allow-remote="true"` or a list of origins on the script tag in `head.hbs`, or set `globalThis.plotdownConfig = {allowRemote: true}` in a file listed before it in `additional-js`.
- **Print** (`print.html`) holds every chapter; the charts render there too.

> [!NOTE]
> Tried with mdBook 0.5.4 on 2026-11-12.
