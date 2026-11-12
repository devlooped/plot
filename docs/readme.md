# The plotdown.cc site

The site at `https://plotdown.cc/`: what plotdown is, the playground, the gallery, the spec and one recipe per surface. It is a pnpm workspace package (`plotdown-site`) that builds into a static folder, `docs/dist`.

```sh
pnpm install
pnpm build                                  # builds @devlooped/plotdown, then the site
pnpm --filter plotdown-site serve           # http://127.0.0.1:4173, with the headers of vercel.json
pnpm --filter plotdown-site test            # the built files, links and origins (fast, no browser)
pnpm --filter plotdown-site test:browser    # Edge or Chrome: charts in light and dark, the playground, shared links
```

`test:browser -- --shots <dir>` also saves screenshots. Set `PLOTDOWN_BROWSER=msedge` or `chrome` to pick the browser.

## What is where

| Path | Source |
| --- | --- |
| `/` | `build/pages.mjs` (`homeBody`). The hero's chart is drawn at build time by the core; every other chart is a `plot` block that `plotdown.js` draws in the page. |
| `/playground/` | `build/pages.mjs` (`playgroundBody`) and `site/playground.ts` |
| `/gallery/` | the 30 fixtures of `spec/fixtures`, titled in `build/catalog.mjs` |
| `/spec/` | `spec/spec.md`, rendered as it is |
| `/recipes/<slug>/` | `recipes/<slug>.md`, listed by route in `build/catalog.mjs` |
| `/llms.txt`, `/llms-full.txt` | `llms.txt`, `llms-full.txt` of this folder, copied |
| `/schema/<version>/plot.schema.json` | `spec/plot.schema.json`; the build checks that its `$id` is this URL and the version is that of `spec/spec.md` |
| `/plotdown.js`, `/plotdown.iife.js` | `packages/plotdown/dist`, the current build, which the pages load |
| `/examples/<name>.json` | the fixtures, which the playground loads by name |

The paths `/svg`, `/png` and `/api` are reserved for the image service and are not used by the site.

Markdown pages are rendered with markdown-it and plotdown's own plugin in client mode (`@devlooped/plotdown/markdown-it`), Shiki for the other code blocks, and GitHub alerts. Links between files of the repository become links of the site (`../../spec/spec.md` → `/spec/`, `./hugo.md` → `/recipes/hugo/`, `https://plotdown.cc/x` → `/x`); any other relative link points to the file on GitHub.

## Adding a recipe

1. Write `recipes/<slug>.md`: an H1, then what to add and how to check it. Show a block as source with four backticks around it; a bare ` ```plot ` block becomes a chart on the page.
2. End it with `> [!NOTE]` / `> Tried with <tool> <version> on <date>.`, or put `> [!WARNING]` / `> Written from the <tool> documentation; not tried yet.` under the H1. The recipe index shows which.
3. Add it to `GROUPS` in `build/catalog.mjs`.
4. Keep the sample you tried in `recipes/samples/<slug>/` (sources only) and check it with `node recipes/samples/check.mjs <dir-or-url>`.

## The playground

The editor's text goes into a `<pre><code class="language-plot">` block of the preview, which `plotdown.js` watches like any block of a page; the playground reads the block's `data-plotdown` state and shows plotdown's error, with its JSON path, where the chart would be, and marks the place in the editor. The block travels in the URL as `#pako:…` (zlib, then base64url: `site/share.ts`), the encoding of the image service, so `https://plotdown.cc/playground/#pako:X` and `https://plotdown.cc/svg/pako:X` hold the same block. `?example=<name>` loads a fixture.

The **Copy image link** button is in the toolbar, disabled (`data-copy-image`). The image service enables it: `encodeSpec()` of `site/share.ts` gives the token.

## Deploying on Vercel

The site and the image service (`packages/service`) are one Vercel project, `plotdown`, whose Root Directory is the repository root; `plotdown.cc` points at it, and every push to `main` deploys. The root `vercel.json` installs the workspace from the lockfile, builds the service and `plotdown-site` with the packages they depend on, serves `docs/dist`, and sends `/svg`, `/png` and `/api/health` to the service's function. For the site's pages it sets a Content-Security-Policy (scripts, styles, fonts and data from the site only; `style-src` allows inline styles, which Shiki's highlighting uses), immutable caching for the hashed files of `/assets/`, and a short cache and CORS for `/plotdown.js`, `/schema/`, `/llms*.txt` and `/examples/`; the service sets its own headers. `build/serve.mjs` applies the same headers locally.
