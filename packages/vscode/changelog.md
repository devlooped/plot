# Changelog

## 0.1.0

- Plot blocks (`plot`, `oplot`, `observable-plot` fences) render as charts in the Markdown preview, redrawn as you type, with a button to show the source.
- A block that fails shows its source, the reason and the JSON path of the mistake.
- Notebook Markdown cells render plot blocks; outputs of type `application/vnd.plotdown+json` render as charts.
- Charts follow the light, dark and high-contrast themes.
- Remote data is off; the `plotdown.allowRemoteData` setting allows it (all, or a list of origins) in trusted workspaces, for the Markdown preview.
- Runs in VS Code for the Web.
