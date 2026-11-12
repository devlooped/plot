# Any HTML page

One script tag renders every plot block of a page as a chart, including blocks the page adds later, such as a streamed chat answer or the next route of a single-page app.

## The script

As a module, anywhere in the page:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>
```

Or as a classic script, where a module cannot go (some CMS fields, old tools):

```html
<script src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.iife.js" defer></script>
```

Both files hold plotdown, Observable Plot and d3; nothing else loads. Each chart is drawn in a shadow root just before its block, which it hides, with a **Source** button to switch back. A block with a mistake stays code, with the reason under it.

## The markup it finds

| Markup | Written by |
| --- | --- |
| `<pre><code class="language-plot">` | markdown-it, marked, remark, Hugo, Jekyll, Python-Markdown, highlight.js, Prism |
| `<pre class="plot">` | Pandoc, SuperFences custom fences |
| `<pre lang="plot">` | GitHub's plain fences, some parsers |
| `div.highlight-source-gnuplot` | GitHub (a JSON block only; real gnuplot stays code) |
| `<pre data-canonical-lang="plot">` | GitLab |
| `class*="language-plot"`, `lang-plot`, `data-lang`, `data-language` | Docsify, Gitea, Chroma, others |

The fence names are `plot`, `oplot` and `observable-plot`. A `plot` block whose text does not start with `{` is left alone.

## Options

On the script tag, or in `globalThis.plotdownConfig` set before the script runs (the way to go with a classic script, a userscript or a CMS):

| Attribute | `plotdownConfig` | Default | |
| --- | --- | --- | --- |
| `data-auto="false"` | `auto: false` | `true` | Do not start; call `plotdown.start()` |
| `data-allow-remote="true"` or origins | `allowRemote: true` or `["https://…"]` | off | Let blocks load `{"url": …}` data and images |
| `data-theme="dark"` | `theme: "dark"` | `"auto"` | Force `light` or `dark` |
| `data-toggle="false"` | `toggle: false` | `true` | No Source button |
| `data-settle="1000"` | `settle: 1000` | `3000` | Milliseconds before a block that does not parse shows its error (`false`: never), so a block still streaming shows none |

## The API

`globalThis.plotdown` (and `@devlooped/plotdown/browser` for bundlers, without side effects):

```js
await plotdown.start({theme: "light"});     // render the page and watch it; {rendered, failed, pending}
plotdown.stop();                             // stop watching; charts stay
await plotdown.renderAll(element);           // render under element now, once
plotdown.configure({allowRemote: ["https://data.example"]});
const renderer = new plotdown.BlockRenderer(plotdown.configure({}));
await renderer.scan(shadowRoot);             // start() does not look into shadow roots
renderer.observe(shadowRoot);
```

## Light and dark

The chart draws in the page's text color, on the background behind the block. The scheme comes from GitHub's `data-color-mode`, the CSS `color-scheme`, the background's luminance, then `prefers-color-scheme`, and it follows a theme toggle while the page is open.

## CSP and self-hosting

The script needs no `eval`, no inline script and no inline style: under `script-src 'self'; style-src 'self'` it works when you serve the file yourself. Take `dist/plotdown.js` (or `dist/plotdown.iife.js`) from `npm i @devlooped/plotdown`, put it next to your pages, and load `/plotdown.js`. With the CDN, add `https://cdn.jsdelivr.net` to `script-src`; pin a version (`@devlooped/plotdown@0.1.0/dist/plotdown.js`) to keep it from changing under you.

Write blocks as the [spec](https://plotdown.cc/spec/) says, and try them in the [playground](https://plotdown.cc/playground/).

> [!NOTE]
> Tried with Microsoft Edge 156 on 2026-11-12: module, classic script with `plotdownConfig`, `script-src 'self'` with the file served by the page, and the API.
