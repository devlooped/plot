# GitHub

> [!WARNING]
> Written from the plotdown documentation; not tried yet.

GitHub runs no script in a README, an issue or a comment, so it cannot draw a `plot` block by itself. There are three ways to get the chart there; only the first works without anything new on github.com, and none is released yet.

## 1. Committed SVG images (coming with the first release)

`plotdown render` writes an SVG image for each block of your Markdown files and puts it right after the block. GitHub shows the image; the block stays in the file as the source:

````markdown
```plot
{"title": "Penguin body mass", "marks": [ … ]}
```
![Penguin body mass](docs/plots/readme-1f3a9c.svg) <!-- plot:1f3a9c -->
````

A second run changes nothing; a changed block gets a new image, and images nothing uses any more are removed. On your machine:

```sh
npx @devlooped/plotdown render "**/*.md"
```

In a workflow, `.github/workflows/plots.yml`, with the GitHub Action:

```yaml
on:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  plots:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: devlooped/plotdown@v1
        with:
          files: "**/*.md"
          commit: true
```

| Input | Default | |
| --- | --- | --- |
| `files` | `**/*.md` | Files or globs, separated by spaces or new lines |
| `out` | `docs/plots` | Where the SVG files go |
| `theme` | `auto` | `auto` (the reader's color scheme), `light` or `dark` |
| `check` | `false` | Change nothing; fail when an image is missing or out of date (for pull requests) |
| `commit` | `false` | Commit and push the changes (needs `contents: write`) |
| `version` | | A version of `@devlooped/plotdown` on npm; empty builds it from the action's source |

For pull requests, run it with `check: true`: a block whose image is missing or stale fails the check, and a broken block fails with its file, line and JSON path. The CLI's options and a CI job for GitLab are in [GitLab CI](./gitlab-ci.md). Until the first release, the action is `devlooped/plotdown@main` and the CLI is not on npm.

## 2. The browser extension (not in the stores yet)

An extension for Chrome, Edge and Firefox that runs [`plotdown.js`](./script-tag.md) on github.com, so blocks in issues, pull requests, comments, READMEs and gists render live, with tips, for whoever has it installed; it works on GitLab, Gitea and AI chats the same way. It is not in the stores yet: build it from [`packages/extension`](https://github.com/devlooped/plotdown/tree/main/packages/extension) and load it unpacked, or use the userscript it builds (`plotdown.user.js`) with Tampermonkey or Violentmonkey.

## 3. Image links (coming with the image service)

For an issue comment, a chat or an email, where you cannot commit a file: an image whose URL holds the block, `https://plotdown.cc/svg/pako:…`. The [playground](https://plotdown.cc/playground/) will copy such a link, in Markdown, for the block you are editing. The service is not running yet.

## Fence names on GitHub

GitHub colors a `plot` fence as gnuplot. Write ```` ```oplot ```` (or ```` ```observable-plot ````) to keep the JSON plain; plotdown treats the three names alike. The [spec](https://plotdown.cc/spec/) has the whole format.

> [!NOTE]
> Tried with the plotdown CLI built from its source on 2026-11-12: `render` added the images, `render --check` passed, then failed on a broken block with its line and JSON path. The action and the rendering on github.com were not tried.
