---
title: Plotdown: render ```plot blocks as Observable Plot charts on every Markdown surface
status: in-progress
created: 2026-11-12
summary: Define a JSON subset of Plot.plot() options and one small core renderer (plotdown), then reach GitHub, GitLab, docs sites, editors and AI chat UIs through ten thin routes (static images, browser extension, script tag, parser plugins, React/Streamdown, the plotdown.cc image service, editor plugins, MCP App, agent skill, upstream PRs).
---

# Plotdown: render ```plot blocks as Observable Plot charts on every Markdown surface

Today a chart in Markdown is either a pasted image or a `vega-lite` block that few hosts render. Observable Plot has no JSON form: its maintainers call serializability a non-goal and say a serializable subset "could be made" by someone else ([plot#1900](https://github.com/observablehq/plot/issues/1900)). No package does it yet.

When this work is done, a fenced `plot` block holding JSON becomes a chart wherever the author or the reader takes one small step: add a CI action, install an extension, add a script tag, add a plugin, or link an image from `plotdown.cc`. One core library, **plotdown**, does the rendering; everything else is an adapter of a few dozen lines.

## What changes

### The block

The block holds strict JSON: the options of `Plot.plot()`, with marks and transforms written as data instead of function calls. The fence name is `plot`; `oplot` and `observable-plot` mean the same.

````markdown
```plot
{
  "title": "Penguin body mass",
  "data": { "penguins": { "csv": "species,body_mass_g\nAdelie,3750\nGentoo,5000\n..." } },
  "color": { "legend": true },
  "y": { "grid": true },
  "marks": [
    { "mark": "rectY", "data": "penguins", "x": "body_mass_g", "fill": "species",
      "transform": [{ "binX": { "y": "count" } }] },
    { "mark": "ruleY", "data": [0] }
  ]
}
```
````

That is the JSON form of:

```js
Plot.plot({
  title: "Penguin body mass", color: {legend: true}, y: {grid: true},
  marks: [
    Plot.rectY(penguins, Plot.binX({y: "count"}, {x: "body_mass_g", fill: "species"})),
    Plot.ruleY([0])
  ]
})
```

| Plot feature | In the JSON subset | How |
| --- | --- | --- |
| Top-level options (size, margins, scales, facets, projection by name, `title`, `subtitle`, `caption`) | Yes | Same keys as `Plot.plot()` |
| All built-in marks, including `auto` | Yes | `{ "mark": "<name>", "data": …, …options }` |
| Channels by field name or constant | Yes | `"x": "body_mass_g"`, `"fill": "steelblue"` |
| Built-in transforms (`bin`, `group`, `stack`, `window`, `map`, `normalize`, `select`, `dodge`, `hexbin`, `shift`, `tree`…) | Yes | `"transform": [{ "<name>": <first argument> }]`, applied in order |
| Named reducers, curves, intervals, schemes, symbols, markers, format strings | Yes | Plot already takes these as strings |
| Data | Yes | Inline rows, inline CSV text, a named dataset, or a URL (URLs are off by default) |
| Dates | Yes | A column or domain made only of ISO 8601 strings becomes `Date` values |
| Functions (accessors, custom reducers, `render`, `tickFormat` callbacks), custom marks, DOM nodes | **No** | Rejected with an error that names the path |

The contract is a document, `spec.md`, and a JSON Schema, `plot.schema.json`. The schema is what editors, other implementations and LLM structured outputs validate against.

**The three fence names.** `plot` is the canonical one. GitHub colors it as gnuplot, because Linguist maps the `.plot` file extension; `oplot` (short for Observable Plot) and `observable-plot` are unknown to GitHub and stay plain text, so an author who minds the colors writes `oplot`. Every adapter accepts all three.

### The core renderer

One TypeScript package, `plotdown`, with `@observablehq/plot` as its only runtime dependency. Plot plus d3 is about 150 kB compressed; mermaid is several megabytes.

```ts
import { render } from "plotdown";

const figure = render(source, {      // source: the text of the block, or a parsed object
  document,                          // optional: jsdom/linkedom document for server-side SVG
  allowRemote: false,                // URLs in data and image marks; false, true or a list of origins
  baseUrl,                           // resolves relative data URLs
});                                  // returns the <figure>/<svg> element, or throws PlotdownError { path, message }
```

It is safe to run on text written by strangers or by a model, which is the point of refusing JavaScript:

- **No code path to `eval`.** The input is `JSON.parse`d and checked against an allowlist of marks, transforms and options. It runs under a strict CSP and in a Manifest V3 extension.
- **Links** in `href` channels are limited to `http`, `https`, `mailto` and relative URLs.
- **No network by default.** Remote data and image marks need `allowRemote`. A chart in an issue comment cannot be used as a tracking pixel.
- **Limits** on source size, rows and marks, so a block cannot freeze the page.
- **Errors stay local.** A block that fails stays a code block with the reason under it, as mermaid does.

### The routes to each surface

```mermaid
flowchart LR
  B["```plot block"] --> C[plotdown core<br/>parse · validate · render]
  C --> S[Static SVG<br/>CLI · GitHub Action]
  C --> A[plotdown.js<br/>script tag]
  A --> X[Browser extension<br/>userscript]
  C --> P[Parser plugins<br/>markdown-it · rehype · marked]
  C --> R[React component<br/>Streamdown renderer]
  C --> W[plotdown.cc<br/>image service]
  C --> E[Editor plugins<br/>VS Code · Obsidian]
  C --> M[MCP App server]
  S --> GH[GitHub · GitLab · Bitbucket]
  X --> GH
  W --> GH
  W --> IM[Comments · chat apps · email<br/>anywhere an image URL shows]
  X --> CH[ChatGPT · Claude · Gemini]
  A --> D[Pages · Hugo · MkDocs · Gitea]
  P --> D2[VitePress · Docusaurus · Astro]
  R --> UI[AI SDK chat apps]
  M --> CH
```

| # | Route | What we ship | Surfaces it lights up | Who acts | Effort |
| --- | --- | --- | --- | --- | --- |
| 1 | **Static images** | CLI `plotdown render` and a GitHub Action that write an SVG per block and put an image next to it | GitHub READMEs, wikis and docs; GitLab; Bitbucket; Azure DevOps; Sourcehut; npm and NuGet readmes | Repo owner, once. Readers do nothing | M |
| 2 | **Script tag** | `plotdown.js`: finds the blocks of the page, renders them live with tooltips, and again when the page changes | GitHub Pages/Jekyll, Hugo, MkDocs Material, Docsify, mdBook, Sphinx, Gitea and Forgejo through a footer template, any HTML page | Site owner adds one line | S |
| 3 | **Browser extension** (Chrome, Edge, Firefox) and a userscript | The same `plotdown.js`, put in every page by the reader's browser instead of by the site | Every site the owner did not set up: github.com (issues, PRs, comments, gists), gitlab.com and self-hosted, Bitbucket, Gitea/Forgejo/Codeberg, Azure DevOps, chatgpt.com, claude.ai, gemini.google.com | Reader installs | S |
| 4 | **Parser plugins** | `plotdown/markdown-it`, `/rehype`, `/marked` | VitePress, Eleventy, Marp, Slidev, Joplin (markdown-it); Docusaurus, Astro/Starlight, Next MDX, Nextra (rehype); marked-based apps | Site or app developer | S each |
| 5 | **React** | `<Plotdown code>` and a ready Streamdown renderer | Streamdown, AI Elements, assistant-ui, any react-markdown chat UI | App developer | S |
| 6 | **Image service** | `plotdown.cc`: a spec encoded in a URL comes back as SVG or PNG | Issue, PR and review comments with no CI; Slack, Discord and Teams messages; email; Notion; anything that shows an image from a URL | Author pastes a link. We host | M, plus running it |
| 7 | **Editor and notes plugins** | VS Code extension (Markdown preview and notebooks), Obsidian plugin | VS Code, Cursor, Windsurf, VSCodium; Obsidian. Later: JetBrains, Logseq, JupyterLab | End user installs | M each |
| 8 | **MCP App** | MCP server with a `render_plot` tool and a `ui://` view | Claude, ChatGPT, VS Code chat, Goose and other MCP Apps hosts | End user adds the server | M |
| 9 | **Agent skill** | `SKILL.md`, `llms.txt` and the schema, so that models write valid blocks | Claude Code, claude.ai, Codex, Copilot, CodeAlta, any agent that reads skills or a system prompt | User or app developer | S |
| 10 | **Upstream** | Proposals and PRs once the format has users | Kroki, then GitLab native; Gitea/Forgejo; Open WebUI; JupyterLab; LibreChat | Their maintainers | L |

Routes 1 to 3 need nothing but the core, and they cover the two hosts the request names:

- **GitHub** has no extension point: mermaid, GeoJSON and STL are product features. Route 1 makes the chart visible to everyone; route 3 makes it live for those who install the extension; route 6 covers comments, where no CI runs; GitHub Pages uses route 2.
- **GitLab** renders extra diagram types only through Kroki, and takes the list of types from the `asciidoctor-kroki` gem. Native support therefore needs three upstream changes (Kroki, the gem, GitLab). Until then: route 1 in GitLab CI, route 3 and route 6.

**Route 1, static images.** The source block stays in the file; the tool adds or updates the image after it, so the file is readable with and without a renderer and a second run changes nothing:

````markdown
```plot
{ "marks": [ … ] }
```
<!-- plot:1f3a9c --> ![Penguin body mass](docs/plots/readme-1f3a9c.svg)
````

```yaml
# .github/workflows/plots.yml
- uses: devlooped/plotdown@v1
  with: { files: "**/*.md", commit: true }
```

**Routes 2 and 3, one script.** `plotdown.js` is the whole renderer in one file, and it knows by itself where blocks are: the markup of Markdown parsers (`pre > code.language-plot`), of GitHub, of GitLab and of the chat sites. It watches the page, so a streamed chat answer renders when its JSON becomes complete. A site owner adds it with one line:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/plotdown/dist/plotdown.js"></script>
```

The extension is that same file and nothing site-specific: it only stands in for the site owner. It differs from the script tag in three ways, all imposed by the browser:

- **The file is inside the extension.** Stores forbid loading code from a CDN, so a new `plotdown.js` reaches readers through an extension update.
- **It is not loaded on every page.** A detector of a few lines runs everywhere and asks for `plotdown.js` only in a tab that has a candidate block, so the other pages pay nothing.
- **It asks for access to all sites.** That is what "works everywhere, self-hosted GitLab included" costs: the browser shows its broad-permission warning at install, and store review takes longer.

On GitHub a `plot` block is `div.highlight-source-gnuplot`, which a real gnuplot script also is, so `plotdown.js` renders it only when its text parses as a spec; `oplot` and `observable-plot` blocks are `pre[lang]` and need no such check.

**Route 5, Streamdown.** Its `plugins.renderers` hook takes a component per language and tells it when the fence is still streaming:

```tsx
import { plotRenderer } from "plotdown/streamdown";

<Streamdown plugins={{ renderers: [plotRenderer] }}>{markdown}</Streamdown>
```

**Route 6, plotdown.cc.** The same server-side renderer as the CLI, behind a URL, in the way of mermaid.ink and Kroki: the spec is deflated and written in base64url.

```text
GET  https://plotdown.cc/svg/pako:eNqrVkrLz1eyUkpKLFKqBQA…     → image/svg+xml
GET  https://plotdown.cc/png/pako:eNqrVkrLz1eyUkpKLFKqBQA…?scale=2   → image/png
POST https://plotdown.cc/svg     (body: the spec)                  → image/svg+xml
```

```markdown
![Penguin body mass](https://plotdown.cc/svg/pako:eNqrVkrLz1eyUkpKLFKqBQA…)
```

The service is stateless: a URL always gives the same image, so answers are cached for good at the edge and by GitHub's image proxy. It never fetches anything: a spec with a data URL or an image mark is refused, which removes server-side request forgery at the root. PNG exists because Slack, Discord and email do not show SVG. The playground and the CLI write these links (`plotdown link chart.json`), and `plotdown render --link` puts them in a Markdown file in place of committed SVG files. The site, the docs and the playground live on the same domain.

### The repository

The repo is an empty scaffold with its .NET parts already removed. It becomes a pnpm workspace:

```text
packages/plotdown/       core, plotdown.js, cli, and the subpath adapters (markdown-it, rehype, marked, react, streamdown)
packages/extension/      manifest, detector and userscript header around plotdown.js
packages/service/        the plotdown.cc image service
packages/vscode/         VS Code extension
packages/obsidian/       Obsidian plugin
packages/mcp/            MCP App server
action.yml               GitHub Action (wraps the CLI)
spec/                    spec.md, plot.schema.json, fixtures/*.json with expected SVG
skills/plot/SKILL.md     agent skill; llms.txt at the site root
docs/                    the plotdown.cc site: playground and one recipe per surface
```

## Steps

Phases 0, 1 and 2 are the first piece of work. Phases 3 to 5 follow, each on its own, once the core is published.

**Phase 0: spec and core**

- [x] 1. Set up the pnpm workspace, TypeScript, Vitest and CI build in the repo; create `packages/plotdown`.
- [x] 2. Write `spec/spec.md` and `spec/plot.schema.json`: top-level options, marks, channels, transforms and their order, data forms, date coercion, limits, what is rejected, and the three fence names.
- [x] 3. Port 30 examples from the Plot documentation to `spec/fixtures/*.json`, covering every mark family and transform.
- [x] 4. Implement `parse`, `validate` and `render` in `packages/plotdown/src/`, with the security rules above and `PlotdownError`.
- [x] 5. Add snapshot tests: each fixture renders to SVG under jsdom and matches the SVG of the equivalent hand-written `Plot.plot()` call.
- [ ] 6. Build `plotdown.js` (ESM and IIFE): the selectors for `pre > code.language-{plot,oplot,observable-plot}`, `pre.plot`, `pre[lang]`, GitHub and GitLab markup, a `MutationObserver`, light and dark colors, a toggle between chart and source, and the error display.
- [ ] 7. Publish the site from `docs/` with a playground (editor on the left, chart on the right) that itself uses `plotdown.js`; point `plotdown.cc` at it once the domain is registered.

**Phase 1: GitHub and GitLab**

- [ ] 8. Add the CLI `plotdown render <files>`: server-side SVG with jsdom, image insertion after each block, content-hashed file names, `--check` for CI.
- [ ] 9. Add `action.yml` and a GitLab CI snippet; use the action on this repo's own `readme.md`.
- [ ] 10. Add to `plotdown.js` the block markup of Bitbucket, Gitea/Forgejo, Azure DevOps, ChatGPT, Claude and Gemini, each read from the live site, with a saved HTML sample as a test.
- [ ] 11. Build the extension in `packages/extension` (Manifest V3; Chrome, Edge, Firefox): a manifest for all sites, the detector, the bundled `plotdown.js` it injects on demand, and an on/off switch per site. Build the userscript as `plotdown.js` under a `@match *://*/*` header.
- [ ] 12. Publish `plotdown` to npm, with `skills/plot/SKILL.md` and `llms.txt` generated from the spec, and submit the extension to the three stores.

**Phase 2: libraries**

- [ ] 13. `plotdown/markdown-it`, `plotdown/rehype` (inline SVG at build time, or client rendering) and `plotdown/marked`, each with a test against its host parser.
- [ ] 14. `plotdown/react` and `plotdown/streamdown`, with a sample chat app.
- [ ] 15. Recipes in `docs/`: Hugo render hook, MkDocs `custom_fences`, Jekyll/GitHub Pages, Docsify, mdBook, Pandoc and Quarto Lua filter, Gitea footer template, VitePress, Docusaurus, Astro.

**Phase 3: plotdown.cc image service**

- [ ] 16. Build `packages/service`: the `/svg` and `/png` routes, GET with `pako:` and POST, the refusal of any remote reference, size limits, immutable cache headers, rate limiting.
- [ ] 17. Deploy it on `plotdown.cc` beside the site, with a deployment workflow and an uptime check.
- [ ] 18. Add `plotdown link`, `plotdown render --link` and a "Copy image link" button in the playground.

**Phase 4: editors and agents**

- [ ] 19. VS Code extension (`markdown.markdownItPlugins`, `markdown.previewScripts`, notebook renderer); publish to the Marketplace and Open VSX.
- [ ] 20. Obsidian plugin (`registerMarkdownCodeBlockProcessor`); submit to the community list.
  - Built and tested in `packages/obsidian` (2026-11-12). Not yet tried in a real vault (Obsidian is not installed on the build machine) and not submitted: Obsidian and BRAT read `manifest.json` from the root of a repository and install from a release tagged `x.y.z`, so the submission needs a decision first (a separate `devlooped/plotdown-obsidian` repository, or a root manifest here); see `packages/obsidian/community-plugins.md`.
- [ ] 21. MCP App server in `packages/mcp` with `@modelcontextprotocol/ext-apps`.

**Phase 5: upstream**

- [ ] 22. Draft the proposals (Kroki diagram type, GitLab, Gitea/Forgejo, Open WebUI, JupyterLab) as files for the user to read. Nothing is filed without the user's go-ahead.

## How it is verified

- [ ] `pnpm test` passes: every fixture validates against the schema and its SVG equals the SVG of the hand-written Plot call.
- [ ] A spec with a function-like string, an unknown mark, a `javascript:` link or a remote URL is rejected with an error that names the path.
- [ ] `pnpm exec plotdown render readme.md` twice in a row leaves `git status` clean after the first run.
- [ ] The rendered SVG of this repo's readme is legible on github.com in the light and the dark theme.
- [ ] With the extension loaded unpacked, `plot`, `oplot` and `observable-plot` blocks render in a GitHub issue comment, a GitLab README and a streamed ChatGPT answer; a real `gnuplot` block on GitHub stays code.
- [ ] With the extension loaded, a page without a block never receives `plotdown.js` (checked in the browser's developer tools).
- [ ] A page with only `<script type="module" src=".../plotdown.js">` and a `language-plot` block shows the chart under `Content-Security-Policy: script-src 'self'`.
- [ ] The Streamdown sample shows a placeholder while the block streams and the chart when it completes.
- [ ] VitePress, Docusaurus and a marked page each build a sample document whose block is a chart.
- [ ] Phase 3: `curl https://plotdown.cc/svg/pako:…` returns the SVG the CLI writes for the same spec; a spec with a data URL gets a `400`; the image shows in a GitHub issue comment and in a Slack message (PNG).

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Chart library | Observable Plot behind our own JSON subset | The request. Vega-Lite is the existing JSON grammar, but Plot specs are terser for a person or a model to write |
| Name | `plotdown`: CLI, `plotdown.js`, extension, and the `plotdown.cc` domain. On npm the package is `@devlooped/plotdown` | Chosen in review: a play on Markdown. Changed during execution (2026-11-12): the user asked to publish under the `devlooped` org, so imports are `@devlooped/plotdown` and `@devlooped/plotdown/markdown-it`, and the script tag is `cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js` |
| Fence name | `plot`, with `oplot` and `observable-plot` as aliases | Chosen in review. `oplot` is short and, like `observable-plot`, is not taken for gnuplot on GitHub |
| Spec format | Strict JSON, no comments, no expressions | Any language can parse it; schemas and structured outputs work; nothing to evaluate |
| Mark encoding | `{ "mark": "dot", … }` and a `transform` array | Close to Mosaic's spec, the nearest prior art, without its DuckDB dependency |
| Unknown keys | Error | A typo that silently draws the wrong chart is worse than a visible error |
| Remote data | Off unless the host opts in; never in the service | Privacy on pages that show other people's content; no request forgery on the server |
| Packaging | One npm package with subpath exports | One install and one version for every adapter; the adapters are tiny |
| Extension | `plotdown.js` on all sites, injected when a block is found; no code per site | Asked in review. One file to maintain, and self-hosted sites work with no setup |
| Static output | SVG from jsdom, no headless browser | Runs in any CI in seconds; `rehype-mermaid` needs Chromium and fails on common hosts |
| Image service | Later phase (3), stateless, on `plotdown.cc` | Chosen in review. Stateless means nothing to store, back up or moderate |
| Where the service runs | Vercel, with the DNS of `plotdown.cc` in Cloudflare | Changed during execution (2026-11-12): the user asked for Vercel. The plan assumed a Cloudflare Worker |

## Risks

- **Plot is at 0.6 and may change options.** The package pins a Plot version, the spec has its own version, and the fixtures fail on drift.
- **Static SVG cannot hold Plot's HTML parts.** Titles, captions and swatch legends are HTML in the browser. The CLI and the service must draw them as SVG themselves, with estimated text widths. If that looks wrong, the CLI's fallback is a `--browser` mode that uses Playwright; the service has no such fallback.
- **The service can be abused or become a cost.** It only computes: no fetch, no storage, hard limits on spec size and render time, rate limits per address, and everything cacheable for good. Long specs do not fit in a URL (a few kilobytes at most); those use POST or route 1.
- **Links to plotdown.cc break if the service stops.** Committed SVG files (route 1) stay the recommended form for READMEs; the docs say so.
- **Chat sites change their markup.** `plotdown.js` keeps its selectors in one table and falls back to any `language-plot` block; a broken selector means "not rendered", never a broken page. The fix reaches readers only with the next extension update.
- **Access to all sites may put readers or a store off.** If it does, the extension ships with the list of known hosts and asks for the others one site at a time; `plotdown.js` does not change.
- **Page CSP may block the `<style>` element Plot writes.** If a target site does, `plotdown.js` renders in a shadow root with a constructed stylesheet.
- **Name and trademark.** The project must state that it is not affiliated with Observable.
- **Models do not know the format.** Without the skill and the schema the block is rarely produced, so they ship with the first npm release (step 12), not in phase 4.

## Out of scope

- JavaScript, expressions or SQL in the block; Mosaic already covers the query-driven case.
- Interaction beyond what Plot gives for free (tips, crosshair): no cross-filtering, inputs or animation.
- Native rendering on GitHub, Notion, Typora, Zed, Slack, Discord and Teams: none has an extension point. They get images, committed or from plotdown.cc.
- Stored or short links on plotdown.cc (`/p/abc123`): that needs a database and moderation.
- A .NET (Markdig) renderer and a CodeAlta plugin: CodeAlta plugins cannot yet handle a fenced block in a message.

<details><summary>Evidence behind the claims</summary>

- **No upstream JSON form.** [plot#1900](https://github.com/observablehq/plot/issues/1900): "Serializability is a non-goal for us… I expect you could make a serializable subset of Plot". Searches of npm and GitHub found no package that renders Plot from JSON; [Mosaic's spec](https://idl.uw.edu/mosaic/api/spec/format.html) is the nearest and requires DuckDB.
- **Sizes.** `@observablehq/plot@0.6.19` UMD is 70 kB and `d3@7` is 78 kB with Brotli (measured on jsDelivr); the `mermaid` package unpacks to 123 MB on npm.
- **GitHub markup.** The Markdown API returns `<div class="highlight highlight-source-gnuplot">` for a `plot` fence, and `<pre lang="oplot">` and `<pre lang="observable-plot">` for the aliases (tested through `gh api markdown`). Linguist lists `.plot` under Gnuplot.
- **GitLab.** [`lib/gitlab/kroki.rb`](https://gitlab.com/gitlab-org/gitlab/-/blob/master/lib/gitlab/kroki.rb) sets `DIAGRAMS_FORMATS = AsciidoctorExtensions::Kroki::SUPPORTED_DIAGRAM_NAMES`.
- **Streamdown.** [Custom renderers](https://streamdown.ai/docs/custom-renderers): `plugins.renderers: [{ language, component }]`, with `code`, `language` and `isIncomplete` props; its own example is `vega-lite`.
- **Server-side rendering.** Plot takes a `document` option and is used with jsdom and linkedom ([discussion #1759](https://github.com/observablehq/plot/discussions/1759)); linkedom runs where jsdom does not, such as edge workers.
- **Image service pattern.** [Kroki's encoding](https://docs.kroki.io/kroki/setup/encode-diagram/) (deflate, then base64url, GET or POST) and mermaid.ink's `/img/pako:…` and `/svg/pako:…`.
- **Static pattern.** `mmdc -i readme.template.md -o readme.md` in [mermaid-cli](https://github.com/mermaid-js/mermaid-cli) replaces blocks with images.
- **MCP Apps.** [ext-apps](https://github.com/modelcontextprotocol/ext-apps) lists Claude, ChatGPT, VS Code and Goose as hosts.
- **VS Code.** [Markdown extension guide](https://code.visualstudio.com/api/extension-guides/markdown-extension) documents `markdown.markdownItPlugins` and `markdown.previewScripts`.
- **Obsidian.** [`registerMarkdownCodeBlockProcessor`](https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerMarkdownCodeBlockProcessor).
- **Not verified:** whether VS Code's `chatOutputRenderers` contribution is stable (so it is not a step); the exact markup of code blocks on chatgpt.com, claude.ai and gemini.google.com (read from the sites in step 10); how each MCP Apps host behaves; that `plotdown.cc` is free to register.

</details>

<details><summary>Alternatives ruled out</summary>

- **Compile the block to Vega-Lite**, to reuse hosts that render `vega-lite` (Kroki, Open WebUI). The grammars differ too much; the result would not be Plot.
- **` ```json plot `** as the fence, for JSON highlighting where nothing renders. Most hosts drop everything after the first word, so the block could not be found.
- **One npm package per adapter** (`rehype-plotdown`, …), the convention of those ecosystems. More releases to keep in step for a few lines each; thin alias packages can be added later if discovery suffers.
- **Running the extension's renderer in the page's own world**, as some mermaid extensions do. Plot needs only the DOM, which the content script already shares.
- **An extension that adds a `<script src>` to the page**, to load `plotdown.js` from the CDN exactly as route 2 does. Stores reject remotely hosted code, and the page's CSP would block the tag on GitHub.
- **Adding Plot to kroki.io instead of hosting a service.** It depends on Kroki's maintainers and still would not give PNG for chat apps; it stays a proposal in phase 5.

</details>
