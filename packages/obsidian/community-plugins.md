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
| A GitHub release tagged exactly with the version (no `v`), with `main.js`, `manifest.json` and `styles.css` attached | Made by `.github/workflows/obsidian.yml` when the tag `x.y.z` is pushed |
| `manifest.json` at the **root** of the repository | Met: the root `manifest.json` and `versions.json` are copies of this folder's, written by `bump` and checked by a test |
| `LICENSE` at the root | Met: `LICENSE` is the repository's license, the same as the packages' `license.txt`, checked by a test |
| `README.md` at the root | **Open**: the root file is `readme.md`. GitHub's API finds it whatever its case, but `https://raw.githubusercontent.com/devlooped/plotdown/HEAD/README.md` answers 404. If the directory's review or Obsidian's plugin page asks for `README.md`, the file has to be renamed (and `.github/workflows/plots.yml`, which names it, with it) |
| No Node or Electron APIs if not desktop-only | Met: `main.js` requires only `obsidian` (tested) |
| No `innerHTML` with user input; no inline styles; no default hotkeys; only errors in the console | Met: the plugin builds the DOM with `textContent` and elements; styles are in `styles.css` with Obsidian's CSS variables |
| Network use disclosed | Remote data is off by default; the readme's Settings section says what turning it on does |

## Where the plugin is released from

Decided on 2026-11-12: **this repository's root**. `devlooped/plotdown` is a monorepo, and Obsidian reads the plugin's `manifest.json` and readme from the root of the repository and installs from the release whose tag equals the manifest's version. So:

- the root holds `manifest.json` and `versions.json` (copies of this folder's) and `LICENSE`;
- plain `x.y.z` tags are reserved for the plugin, and `.github/workflows/obsidian.yml` turns such a tag into the release with the three files; the action uses `v1`, and npm versions are not tagged;
- the root readme, which presents the whole project, is the plugin's page in Obsidian;
- BRAT installs from the same releases: `devlooped/plotdown`.

A repository of its own (`devlooped/plotdown-obsidian`) was the alternative; it would give the plugin its own readme and independent releases.

## After it is listed

Announce it in the forum's [Share & showcase](https://forum.obsidian.md/c/share-showcase/9) and on Discord in `#updates` (the `developer` role is needed there).
