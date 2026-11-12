# plotdown for VS Code

Renders fenced `plot` blocks of strict JSON as [Observable Plot](https://observablehq.com/plot/) charts in the Markdown preview and in notebooks. Works in VS Code, VS Code for the Web, Cursor, Windsurf and VSCodium.

![A Markdown file and its preview with two charts](https://raw.githubusercontent.com/devlooped/plotdown/main/packages/vscode/media/preview.png)

A block holds the options of `Plot.plot()` as JSON, with marks and transforms as data:

````markdown
```plot
{
  "data": {"penguins": {"csv": "species,body_mass_g\nAdelie,3750\nGentoo,5000\nChinstrap,3500\n"}},
  "marks": [
    {"mark": "barY", "data": "penguins", "x": "species", "y": "body_mass_g", "fill": "species"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```
````

The fence is `plot`, `oplot` or `observable-plot`. A `plot` fence whose text does not start with `{` (a gnuplot script) stays code. The format is defined in the [plotdown spec](https://github.com/devlooped/plotdown/blob/main/spec/spec.md).

## Where charts appear

- **Markdown preview**: each block becomes a chart, redrawn as you type, with a **Source** button that shows the JSON. A block that fails stays code, with the reason and the JSON path of the mistake under it (`unknown option "colour" for the dot mark at $.marks[0].colour`).
- **Notebook Markdown cells** (and `text/markdown` outputs): the same blocks render in Jupyter notebooks and any other notebook VS Code opens.
- **Notebook outputs of type `application/vnd.plotdown+json`**: a kernel can show a chart by displaying a plot block under this MIME type, such as from Python:

  ```python
  from IPython.display import display
  spec = {"marks": [{"mark": "dot", "data": [[1, 2], [2, 4], [3, 3]], "x": "0", "y": "1"}]}
  display({"application/vnd.plotdown+json": spec, "text/plain": "plotdown chart"}, raw=True)
  ```

Charts follow the editor's light, dark and high-contrast themes.

## Remote data

A block can name its data by URL (`"data": {"a": {"url": "https://…/a.csv"}}`). Nothing loads from the network unless you allow it:

| Setting | Effect |
| --- | --- |
| `"plotdown.allowRemoteData": false` | The default. A block with a data URL shows why it is refused. |
| `"plotdown.allowRemoteData": ["https://cdn.jsdelivr.net"]` | Data loads from these origins only. |
| `"plotdown.allowRemoteData": true` | Data loads from any `http` or `https` URL. |

The setting has no effect in a workspace you have not trusted. Data is loaded by the extension, not by the preview, and only for the Markdown preview: notebooks never load remote data. URLs must be absolute `http` or `https` URLs.

## Safety

plotdown evaluates nothing: marks, transforms and options are looked up in allowlists, strings that look like JavaScript functions are rejected, links are limited to `http`, `https` and `mailto`, and the size of a block is capped. A block from an untrusted file is as safe to preview as any other Markdown.

plotdown is not affiliated with Observable, Inc.

## License

MIT. Includes Observable Plot and d3 (ISC).
