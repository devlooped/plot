# Plotdown for Obsidian

Render `plot` code blocks of JSON as [Observable Plot](https://observablehq.com/plot/) charts in your notes, in reading view and in live preview, on desktop and mobile.

````markdown
```plot
{
  "data": {"penguins": {"csv": "species,body_mass_g\nAdelie,3750\nGentoo,5000\nChinstrap,3500\n"}},
  "marks": [
    {"mark": "barY", "data": "penguins", "x": "species", "y": "body_mass_g", "fill": "species", "tip": true},
    {"mark": "ruleY", "data": [0]}
  ]
}
```
````

A block holds the options of `Plot.plot()` as strict JSON, with marks and transforms as data: `{"mark": "dot", …}` for `Plot.dot(…)`, `"transform": [{"binX": {"y": "count"}}]` for `Plot.binX(…)`. The fence may also be `oplot` or `observable-plot`. The format is defined in [`spec/spec.md`](https://github.com/devlooped/plotdown/blob/main/spec/spec.md); the same blocks render on GitHub, in VS Code and on web pages with the other plotdown tools.

- **Theme colors.** Axes, labels and tips follow the text and background colors of your theme, light or dark.
- **Errors stay readable.** A block that fails stays code, with the reason and the JSON path of the problem under it, such as `$.marks[0].mark`.
- **Nothing is loaded from the network** unless you allow it: see [Settings](#settings).
- **Nothing is evaluated.** The block is data: no JavaScript, no expressions. Marks, transforms and options are checked against lists taken from Plot's own type declarations.

## Install

The plugin is not in the community plugins yet: until it is listed, install it with BRAT or by hand from its GitHub release, or build it as [Develop](#develop) says.

### From the community plugins

Once the plugin is listed: **Settings → Community plugins → Browse**, search for "Plotdown", then **Install** and **Enable**.

### With BRAT (beta versions)

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the community plugins.
2. Run the command **BRAT: Add a beta plugin for testing** and enter `devlooped/plotdown`.
3. Enable **Plotdown** in **Settings → Community plugins**.

BRAT installs the `main.js`, `manifest.json` and `styles.css` of the repository's latest GitHub release.

### By hand

1. Download `main.js`, `manifest.json` and `styles.css` from the release named "Plotdown for Obsidian" in the [releases](https://github.com/devlooped/plotdown/releases).
2. Put them in `<your vault>/.obsidian/plugins/plotdown/` (create the folder; `.obsidian` is hidden on macOS and Linux).
3. Reload Obsidian, then enable **Plotdown** in **Settings → Community plugins**.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Load remote data | Off | Lets blocks load data files (`{"url": "https://…"}`) and images from the internet. Off, such a block shows an error instead, and no request is made: a note someone else wrote cannot make your vault call a server when you open it. On, files are loaded with Obsidian's `requestUrl`, which works on mobile and is not limited by CORS. Reopen a note to apply a change. |

Files of the vault cannot be used as data: data is inline (rows, `{"csv": …}`, `{"tsv": …}`, GeoJSON) or an `http`/`https` URL.

## Limits

- Tips and the crosshair appear when the pointer moves over the chart; they need a mouse or a tap.
- The raster mark needs a canvas, which Obsidian has; contour and density marks work as in Plot.
- If another plugin already handles `plot` blocks (some plotting plugins do), Plotdown leaves them to it and logs an error in the console; use `oplot` or `observable-plot` blocks instead.
- Charts are drawn once, when the block is shown: a change of the setting applies to the notes you open next.

## Develop

From the root of the repository (pnpm 10, Node 24):

```sh
pnpm install
pnpm --filter plotdown-obsidian build    # dist/main.js, dist/manifest.json, dist/styles.css
pnpm --filter plotdown-obsidian test     # vitest, with a stand-in for the Obsidian API
pnpm --filter plotdown-obsidian dev      # rebuilds on change
```

To try it in a real vault (opened once in Obsidian, so that it has a `.obsidian` folder):

```sh
pnpm --filter plotdown-obsidian vault -- "<path to the vault>" --sample
```

This copies the three files to `<vault>/.obsidian/plugins/plotdown/` (keeping your settings in `data.json`) and, with `--sample`, the note [`sample/plotdown.md`](sample/plotdown.md) to the root of the vault. `OBSIDIAN_VAULT` can hold the path instead. Then enable **Plotdown** in **Settings → Community plugins**, or turn it off and on again after a new build and copy.

`main.js` bundles the plotdown core and Observable Plot (about 430 kB minified); it needs nothing but the `obsidian` module, so it runs on mobile. A test checks that.

### Release

The plugin is released from this repository: Obsidian and BRAT read `manifest.json` and `versions.json` at the root of the repository, and install the GitHub release whose tag is exactly the manifest's version (`x.y.z`, no `v`). Plain `x.y.z` tags are therefore reserved for the plugin.

1. `pnpm --filter plotdown-obsidian bump -- x.y.z` sets the version in `package.json` and `manifest.json`, records it in `versions.json` with `minAppVersion`, and copies both files to the root of the repository (a test fails when the copies differ).
2. Commit, then push the tag `x.y.z`: the workflow `.github/workflows/obsidian.yml` builds the plugin and creates the release with `main.js`, `manifest.json` and `styles.css`.

See [`community-plugins.md`](community-plugins.md) for the listing in Obsidian's community plugins.

plotdown is not affiliated with Observable, Inc. or with Obsidian.

## License

MIT
