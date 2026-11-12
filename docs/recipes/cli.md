# The command line

`plotdown` comes with the npm package `@devlooped/plotdown` and needs Node 22 or later. It has two commands: `render`, which puts an image after each block of Markdown files, and `link`, which prints the image link of a block.

```sh
npx @devlooped/plotdown render "**/*.md"     # or: npm i -D @devlooped/plotdown, then npx plotdown …
```

## `plotdown render`

For each block of the Markdown files, `render` writes an SVG file, `docs/plots/<file>-<hash>.svg`, and puts its image on the line right after the block:

````markdown
```plot
{"title": "Penguin body mass", "marks": [ … ]}
```
![Penguin body mass](docs/plots/readme-1f3a9c.svg) <!-- plot:1f3a9c -->
````

The block stays in the file. When a block changes, its image line and its file change with it; SVG files that nothing references any more are removed; a second run changes nothing. The SVG holds everything itself (title, legend, its light and dark colors) and loads nothing.

| Option | Default | |
| --- | --- | --- |
| `--out <dir>` | `docs/plots` | Where the SVG files go, from the current directory |
| `--check` | | Change nothing; exit with 1 when a run would change something (for CI) |
| `--theme <theme>` | `auto` | `auto` follows the reader's light or dark color scheme; `light` and `dark` fix the colors |
| `--link` | | Put [image links](./image-links.md) to `plotdown.cc` instead of writing SVG files |
| `--png` | | With `--link`: PNG links |
| `--base-url <url>` | `https://plotdown.cc` | With `--link`: the image service, if you run your own |

Globs are expanded by plotdown, from the current directory, without entering `node_modules` or `.git`: quote them so that the shell leaves them alone. An invalid block fails the run with its file, line and JSON path, and its file is left as it is:

```text
readme.md:12: error: $.marks[0].mark: unknown mark "barZ"; did you mean "barX"?
```

In a GitHub workflow the same errors are annotations on the file. The [GitHub Action](./github.md) and the [GitLab CI job](./gitlab-ci.md) run this command.

## `plotdown link`

Prints the image link of a block, which holds the whole block: `https://plotdown.cc/svg/pako:…`.

```sh
npx @devlooped/plotdown link chart.plotdown.json            # a block kept in a file of its own
npx @devlooped/plotdown link -m readme.md                   # ![Title](https://plotdown.cc/svg/pako:…), one line per block
echo '{"marks": [{"mark": "ruleY", "data": [0]}]}' | npx @devlooped/plotdown link --png
```

A block in a file of its own is the JSON alone, without a fence, in a file named `*.plotdown.json`; editors validate it against the schema when it starts with `"$schema": "https://plotdown.cc/schema/plot.schema.json"`.

| Option | |
| --- | --- |
| `--png` | A PNG link, for Slack, Discord and email (default: SVG) |
| `--markdown`, `-m` | Print a Markdown image, `![alt](url)`, instead of the URL |
| `--theme <theme>` | SVG: `auto` (default), `light`, `dark`. PNG: `light` (default), `dark` |
| `--scale <n>` | PNG: 1 (default), 2, 3 or 4 pixels per CSS pixel |
| `--base-url <url>` | The image service (default `https://plotdown.cc`) |
| `--max-length <n>` | The longest link (default 8,000 characters) |

Each block is drawn first, so a mistake is reported with its line and JSON path instead of becoming a broken image. A block too long for a link is refused: commit an SVG file with `plotdown render` instead.

`plotdown <command> --help` lists the options.

> [!NOTE]
> Tried with `@devlooped/plotdown` 0.1.0 installed from its packed tarball on 2026-11-12: `render`, `render --check`, `render --link`, `link` and `link -m --png --scale 2`.
