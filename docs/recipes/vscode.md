# VS Code

The plotdown extension draws `plot` blocks as charts in VS Code's Markdown preview and in notebooks, in the colors of your theme. It works in VS Code 1.90 or later, Cursor, Windsurf and VSCodium.

> [!WARNING]
> The extension is **not on the Visual Studio Marketplace or Open VSX yet**. Today, build the `.vsix` from the repository and install it.

## Install it from the repository

With Node 24 and pnpm 10, in a clone of the [repository](https://github.com/devlooped/plotdown):

```sh
pnpm install
pnpm build
pnpm --filter plotdown package       # packages/vscode/pack/plotdown-0.1.0.vsix
code --install-extension packages/vscode/pack/plotdown-0.1.0.vsix
```

Or, in VS Code, **Extensions: Install from VSIX…** and pick the file. Cursor, Windsurf and VSCodium take the same file (`cursor --install-extension …`, or their own **Install from VSIX** command).

## Where charts appear

- **Markdown preview** (**Markdown: Open Preview to the Side**): each block becomes a chart, redrawn as you type, with a **Source** button. A block with a mistake stays code, with the reason and its JSON path under it.
- **Notebook Markdown cells**, in Jupyter and other notebooks.
- **Notebook outputs** of type `application/vnd.plotdown+json`: a kernel shows a chart by displaying a block under that MIME type:

  ```python
  from IPython.display import display
  spec = {"marks": [{"mark": "dot", "data": [[1, 2], [2, 4], [3, 3]], "x": "0", "y": "1"}]}
  display({"application/vnd.plotdown+json": spec, "text/plain": "plotdown chart"}, raw=True)
  ```

## Remote data

Off by default. `"plotdown.allowRemoteData"` takes `true` or a list of origins (`["https://cdn.jsdelivr.net"]`), applies in trusted workspaces only, and only in the Markdown preview: notebooks never load remote data.

## Write blocks with the schema

A block kept in a file of its own, named `*.plotdown.json`, gets completion and validation from VS Code's JSON support when it names the schema:

```json
{
  "$schema": "https://plotdown.cc/schema/plot.schema.json",
  "marks": [{"mark": "barY", "data": [{"a": "x", "b": 1}, {"a": "y", "b": 3}], "x": "a", "y": "b"}]
}
```

The same file gives an image link with `plotdown link chart.plotdown.json` (see [the command line](./cli.md)).

More: [the extension's readme](../../packages/vscode/readme.md).

> [!NOTE]
> Tried with the extension built from the repository on 2026-11-12, by its end-to-end test in VS Code 1.90 and 1.146: the Markdown preview, notebook cells and outputs, the themes. Installing from the `.vsix` in Cursor, Windsurf and VSCodium was not tried.
