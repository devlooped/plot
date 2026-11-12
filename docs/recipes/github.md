# GitHub

GitHub runs no script in a README, an issue or a comment, so it cannot draw a `plot` block by itself. There are three ways to get the chart there: committed images and image links work for every reader; the browser extension makes the blocks live for those who install it.

## 1. Committed SVG images

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
| `commit-message` | `Render plot blocks` | The message of that commit |
| `version` | | A version of `@devlooped/plotdown` on npm to run; empty builds it from the action's own source |

For pull requests, run it with `check: true`: a block whose image is missing or stale fails the check, and a broken block fails with its file, line and JSON path. The CLI's options are in [the command line](./cli.md), and a CI job for GitLab in [GitLab CI](./gitlab-ci.md). The action's output `changed` says whether the run changed files.

## 2. The browser extension

An extension for Chrome, Edge and Firefox that runs [`plotdown.js`](./script-tag.md) on github.com, so blocks in issues, pull requests, comments, READMEs and gists render live, with tips, for whoever has it installed; it works on GitLab, Gitea and AI chats the same way. It is not in the stores yet: [load it unpacked, or use the userscript](./browser-extension.md).

## 3. Image links

For an issue or pull request comment, where you cannot commit a file: an image whose URL holds the block, `https://plotdown.cc/svg/pako:…`. The [playground](https://plotdown.cc/playground/)'s **Copy image link** copies one as Markdown, and `plotdown link` prints one; see [image links](./image-links.md), and why committed files are better for a README.

## Fence names on GitHub

GitHub colors a `plot` fence as gnuplot. Write ```` ```oplot ```` (or ```` ```observable-plot ````) to keep the JSON plain; plotdown treats the three names alike. The [spec](https://plotdown.cc/spec/) has the whole format.

> [!NOTE]
> Tried with the CLI and the action on 2026-11-12: the CLI added the images, `render --check` passed, then failed on a broken block with its line and JSON path; the action checks and renders the readme of the [plotdown repository](https://github.com/devlooped/plotdown) in its `plots` workflow (with `uses: ./`, the action of the same commit). Whether the images read well in GitHub's dark theme was not checked by hand.
