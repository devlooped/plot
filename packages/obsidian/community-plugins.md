# Listing Plotdown in Obsidian's community plugins (draft)

Nothing here has been submitted. This is what the submission needs, checked on 2026-11-12 against [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) and [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases).

## The entry

The entry for `community-plugins.json` in `obsidianmd/obsidian-releases`, taken from [`manifest.json`](manifest.json) (`id`, `name`, `author` and `description` must match it):

```json
{
  "id": "plotdown",
  "name": "Plotdown",
  "author": "Devlooped",
  "description": "Render plot code blocks of JSON as Observable Plot charts: bars, lines, dots, maps and more, in the colors of your theme.",
  "repo": "devlooped/plotdown"
}
```

The documentation now sends submissions through the directory at <https://community.obsidian.md> instead of a pull request to that file: sign in with an Obsidian account, link the GitHub account that owns the repository, then **Add a plugin or theme**. The directory reads `manifest.json` from the head of the default branch and runs an automated review; problems are fixed with a new release of a higher version.

## What the submission requires, and where Plotdown stands

| Requirement | Status |
| --- | --- |
| `id` unique and without "obsidian" | `plotdown`; not among the 10,300 entries of `community-plugins.json` on 2026-11-12 (check again before submitting) |
| `manifest.json` with `version` in `x.y.z` | [`manifest.json`](manifest.json), `0.1.0`; `isDesktopOnly: false` |
| `versions.json` (plugin version → minimum Obsidian version) | [`versions.json`](versions.json); `minAppVersion` is `1.0.0` |
| A GitHub release tagged exactly with the version (no `v`), with `main.js`, `manifest.json` and `styles.css` attached | Not made. `pnpm --filter plotdown-obsidian build` writes the three files to `dist/` |
| `README.md`, `LICENSE` and `manifest.json` at the **root** of the repository | **Not met by `devlooped/plotdown`**: see below |
| No Node or Electron APIs if not desktop-only | Met: `main.js` requires only `obsidian` (tested) |
| No `innerHTML` with user input; no inline styles; no default hotkeys; only errors in the console | Met: the plugin builds the DOM with `textContent` and elements; styles are in `styles.css` with Obsidian's CSS variables |
| Network use disclosed | Remote data is off by default; the readme's Settings section says what turning it on does |

## The decision before submitting: which repository

Obsidian reads the plugin's `manifest.json` and readme from the root of the repository and installs from the release whose tag equals the manifest's version. `devlooped/plotdown` is a monorepo: its root holds the readme of the whole project, `license.txt` (not `LICENSE`), no `manifest.json`, and its releases will also carry the npm package. Two ways out:

1. **A repository of its own** (recommended), such as `devlooped/plotdown-obsidian`: a release workflow in `devlooped/plotdown` builds `packages/obsidian` and pushes `readme.md` (as `README.md`), `manifest.json`, `versions.json` and `LICENSE` to it, then creates the `x.y.z` release there with the three files. The entry's `repo` and the readme's BRAT and release links then name that repository. Plugin versions and npm versions stay independent.
2. **This repository's root**: add `manifest.json` (a copy of this one, kept in step by `bump`), a `LICENSE` file, and plain `x.y.z` tags reserved for the plugin, with the npm package tagged differently (such as `plotdown-v0.1.0`). The root readme then serves as the plugin's page in Obsidian, which suits the plugin less.

BRAT has the same needs: it installs the assets of a GitHub release of the repository it is given, so it also needs releases that carry `main.js` and `manifest.json`.

## After it is listed

Announce it in the forum's [Share & showcase](https://forum.obsidian.md/c/share-showcase/9) and on Discord in `#updates` (the `developer` role is needed there).
