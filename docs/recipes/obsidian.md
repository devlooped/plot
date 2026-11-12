# Obsidian

> [!WARNING]
> Written from the Obsidian plugin's documentation and tests; not tried in Obsidian yet.

The Plotdown plugin draws `plot` blocks in your notes as charts, in reading view and live preview, on desktop and mobile, in the colors of your theme.

## Install

The plugin is **not in Obsidian's community plugins yet**. Until it is listed, install it from its GitHub release, with BRAT or by hand.

**With BRAT:**

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the community plugins.
2. Run **BRAT: Add a beta plugin for testing** and enter `devlooped/plotdown`.
3. Enable **Plotdown** in **Settings → Community plugins**.

**By hand:** download `main.js`, `manifest.json` and `styles.css` from the release named "Plotdown for Obsidian" in the [releases](https://github.com/devlooped/plotdown/releases) into `<your vault>/.obsidian/plugins/plotdown/` (`.obsidian` is hidden on macOS and Linux), reload Obsidian, and enable **Plotdown**.

**From the community plugins**, once listed: **Settings → Community plugins → Browse**, search for "Plotdown", **Install**, then **Enable**.

**From the source**, with Node 24 and pnpm 10, in a clone of the [repository](https://github.com/devlooped/plotdown):

```sh
pnpm install
pnpm build
pnpm --filter plotdown-obsidian vault -- "<path to your vault>" --sample
```

This copies the three files to `<vault>/.obsidian/plugins/plotdown/` (the vault must have been opened once in Obsidian), and with `--sample` a note of examples to the root of the vault.

## Write a chart

In any note:

````markdown
```plot
{
  "y": {"grid": true},
  "marks": [
    {"mark": "barY", "data": [{"species": "Adelie", "mass": 3750}, {"species": "Gentoo", "mass": 5000}], "x": "species", "y": "mass", "fill": "species", "tip": true},
    {"mark": "ruleY", "data": [0]}
  ]
}
```
````

`oplot` and `observable-plot` work too. The [spec](https://plotdown.cc/spec/) lists the marks and options; the [playground](https://plotdown.cc/playground/) checks a block as you type.

## Settings

| Setting | Default | |
| --- | --- | --- |
| Load remote data | Off | Lets blocks load `{"url": "https://…"}` data and images, with Obsidian's `requestUrl` (works on mobile, not limited by CORS). Off, such a block shows an error and makes no request, so a note someone else wrote cannot make your vault call a server. |

Files of the vault cannot be data: put it inline (rows, `{"csv": …}`, `{"tsv": …}`, GeoJSON) or behind an `https` URL.

## Notes

- **Errors** stay readable: a block that fails stays code, with the reason and its JSON path (`$.marks[0].mark`) under it.
- **Another plugin that handles `plot` blocks** (some plotting plugins do) keeps them; Plotdown logs an error in the console. Write `oplot` blocks instead.
- **Tips** and the crosshair need a mouse or a tap.
- A change of the setting applies to the notes you open next.
- The same blocks render on the web and in docs sites: see the [script tag](./script-tag.md).
