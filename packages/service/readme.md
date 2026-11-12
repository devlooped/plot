# plotdown image service

The service behind `https://plotdown.cc/svg/…` and `/png/…`: a plot block in a URL comes back as an image, for the places that show an image from a URL and nothing else (issue and PR comments without CI, Slack, Discord, Teams, email, Notion).

```markdown
![Penguin body mass](https://plotdown.cc/svg/pako:eNqFUz1PwzAU3PkVlieQP…)
```

It draws with the same static renderer as `plotdown render` (`@devlooped/plotdown/static`, with linkedom), so a link gives byte for byte the SVG that the CLI commits for the same block. It is stateless: nothing is stored, and the URL holds the whole chart.

## Routes

| Request | Answer |
| --- | --- |
| `GET`, `HEAD /svg/pako:<data>` | `image/svg+xml` |
| `GET`, `HEAD /png/pako:<data>` | `image/png` |
| `POST /svg`, `POST /png` (body: the block's text) | the same, never cached |
| `GET /api/health` | `{"status": "ok", "renderer": "plotdown/0.1.0 plot/0.6.19 service/0.1.0"}` |
| `OPTIONS` on any of them | CORS preflight, `204` |

`pako:<data>` is the encoding of mermaid.ink and Kroki: the block's UTF-8 text compressed as a zlib stream, then base64url without padding. Any zlib stream is read (made by `pako`, Node's `zlib`, Python's `zlib.compress`); the links that plotdown makes use its own deterministic compressor, so the same block gives the same URL in Node and in browsers.

### Query options

Only two, because every distinct URL is one more entry in every cache:

| Option | SVG | PNG |
| --- | --- | --- |
| `theme` | `auto` (default: the reader's color scheme), `light`, `dark` | `light` (default), `dark`; `auto` is refused: a PNG cannot follow the reader |
| `scale` | refused | `1` (default), `2`, `3`, `4` device pixels per CSS pixel |

Links leave out an option set to its default. Other query parameters are ignored, so `?v=2` can force an image proxy to fetch a link again.

The text is canonicalized before it is drawn, as links do: no byte order mark, LF line endings, no leading or trailing whitespace. Whitespace inside the JSON is kept: the SVG names its ids after the text, and `plotdown render` writes the SVG of the text as it is in the fence.

## Limits

| Limit | Value | Answer |
| --- | --- | --- |
| Encoded block in a GET path | 16,384 characters (Vercel stops URLs at 14 KB before this) | `414` |
| Block, decoded or posted | 262,144 bytes; inflating stops as soon as it is passed, so a zip bomb costs nothing | `413` |
| Block contents | plotdown's own limits: 64 marks, 100,000 rows, 10,000 px wide or high… | `400` |
| SVG | 4,000,000 bytes (a function answers at most 4.5 MB) | `422` |
| PNG | 8,192 px a side and 4096 × 4096 px in all | `422` |
| Render time (chart and PNG) | 5 s; the worker thread is terminated and replaced | `422` |
| Memory of a render | 512 MB per worker thread | `422` |
| Renders waiting on one instance | 16 | `503`, `Retry-After: 5` |
| Renders per client IP | the Vercel Firewall rule `plotdown-render` (see below) | `429`, `Retry-After: 60` |

A chart is drawn synchronously, so the time limit needs another thread: `RenderPool` keeps one or two worker threads (`dist/worker.js`) loaded with Plot and resvg, sends each render to one, and terminates it when the time passes.

## Errors

An invalid block gets `400`, and the body is an image that says why, where the chart would have been:

- **Why an image.** In a README, a `400` with a JSON body is a broken-image icon that tells the author nothing; an SVG (or a PNG, for a PNG link) that reads `$.data.d.url: the data URL … would load from the network` tells them what to fix on the page itself. Browsers draw an image body that decodes even when the status is an error; whether GitHub's image proxy passes a `400` image through is not verified yet.
- **Why still 400.** Tools, the uptime check and caches must see a failure. Vercel's CDN does not cache a `400`; browsers and proxies may keep it an hour (`Cache-Control: public, max-age=3600`), since the same block stays invalid for the same renderer.
- **JSON for scripts.** With `Accept: application/json`, every error is `{"error": {"status", "code", "message", "path", "line", "column"}}`. The headers `Plotdown-Error-Code` and `Plotdown-Error-Path` (URL-encoded) come with the image too.

Codes: `invalid-block` (400, with the JSON path; a JSON syntax error also has a line and a column), `invalid-encoding`, `invalid-option`, `missing-block` (400), `uri-too-long` (414), `block-too-large` (413), `image-too-large`, `render-timeout`, `render-failed` (422), `rate-limited` (429), `busy` (503).

The service never fetches anything: a block with a data URL or an image `src` that is a remote URL is refused (`400`, path `$.data.<name>.url` or `$.marks[n].src`), so there is no server-side request forgery to defend against.

## Caching, and new releases of the renderer

A URL holds the whole chart, so for a given renderer it always gives the same image:

```http
Cache-Control: public, max-age=31536000, immutable
Vercel-CDN-Cache-Control: max-age=31536000
ETag: "<sha256 of the renderer id, the format, the options and the block>"
```

- **Vercel's CDN** caches `GET` and `HEAD` answers with status 200 for a year, per region. Its cache key includes the deployment, so **each deployment starts with an empty cache**: a new release of the renderer draws every image again on plotdown.cc as soon as it is deployed, with no purge.
- **Browsers, GitHub's image proxy (camo), Slack's and others** keep the image they got for good (`immutable`, a year). A release that changes how a chart looks reaches them only for URLs they have not seen. That is the intended trade: a chart already shown does not change under its readers. An author who wants the new drawing in a README changes the URL (adds `?v=2`, which the service ignores).
- **ETag** is computed from the request before anything is drawn, so `If-None-Match` gets a `304` without a render. The renderer id (the versions of plotdown, Plot and this service) is part of it: a release changes every ETag.
- **POST** answers are `no-store`: Vercel's CDN only caches `GET` and `HEAD`. Long blocks that do not fit in a URL go there, or in a committed SVG file (`plotdown render`).
- Vercel's CDN keys on `Accept` too, so browsers and proxies that send different `Accept` headers fill separate entries.

## Security headers

Every answer has:

```http
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox
X-Content-Type-Options: nosniff
Cross-Origin-Resource-Policy: cross-origin
Referrer-Policy: no-referrer
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: ETag, Plotdown-Renderer, Plotdown-Width, Plotdown-Height, Plotdown-Error-Code, Plotdown-Error-Path
```

An SVG opened by itself is a document of plotdown.cc. The `sandbox` directive gives it an opaque origin and no script, so it cannot read the site's storage or call its pages, and the policy lets it load nothing but its inline `<style>` and its `data:` images (raster marks and ramp legends). The static renderer already writes no script, no `foreignObject` and no remote reference; the headers hold even if it did. CORS is open to every origin: the images are public, and the playground and other pages fetch them.

## PNG

[resvg](https://github.com/linebender/resvg) through `@resvg/resvg-js` (a Node-API binary; Vercel installs its Linux x64 build). It loads only the fonts of this package, never the system's, so that a PNG looks the same everywhere: **Liberation Sans** Regular and Bold (`fonts/`, SIL Open Font License, see `fonts/LICENSE`). It has the advance widths of Arial and Helvetica, which are the widths the static SVG estimates titles, legends and wrapping with, so text fits where the SVG placed it. It covers Latin, Greek and Cyrillic, and the arrows and minus sign Plot writes in axis labels; Chinese, Japanese, Korean and emoji have no glyphs and are drawn as boxes.

## Rate limiting

The renderer runs only on a cache miss, and a cache hit never reaches the function. So the function asks the Vercel Firewall before each render, and only then, with `checkRateLimit("plotdown-render", {request})` of `@vercel/firewall`. The counter is per client IP, per region. A rule on the paths in the dashboard would also count the cache hits, including the many requests of GitHub's image proxy, which come from a few addresses.

Without the rule, outside Vercel, or when the firewall does not answer within a second, every request passes: the service's own limits (size, time, pixels, memory, queue) still hold. `PLOTDOWN_RATE_LIMIT_ID` names another rule, or `off`.

## Run it

```sh
pnpm build                                  # the core, then the service
node packages/service/dist/serve.js 8787    # a plain Node server: http://localhost:8787/api/health
pnpm exec plotdown link --base-url http://localhost:8787 chart.json
vercel dev                                  # the Vercel function and its rewrites, beside the site (after pnpm build)
```

As a library: `createService({renderer, rendererId, limits, rateLimit})` turns a `Request` into a `Response` (Fetch API) with any `ImageRenderer`; `createNodeService()` runs it with worker threads; `createInProcessRenderer()` draws in the calling thread (no time limit: tests and trusted input).

## On Vercel

- `api/plotdown.ts` (repo root) re-exports `@devlooped/plotdown-service/vercel`, a `{fetch}` handler. The function sees the original URL and routes on it.
- `vercel.json` (repo root) rewrites `/svg`, `/svg/…`, `/png`, `/png/…` and `/api/health` to it, sets `maxDuration: 15`, and includes `packages/service/{dist,fonts}/**` in the function (the worker file and the fonts are loaded by path, not imported). Its build command builds the service and its dependencies (`pnpm --filter @devlooped/plotdown-service... build`) before the site, so the function bundles the built workspace packages.

## Image links

Links are made by `@devlooped/plotdown/link`, which runs in Node and in browsers and imports nothing:

```js
import {imageLink, markdownImage, LinkTooLongError, MAX_LINK_LENGTH} from "@devlooped/plotdown/link";

try {
  const url = imageLink(blockText, {format: "svg", baseUrl: location.origin}); // format "png", theme, scale
  await navigator.clipboard.writeText(markdownImage(url, "Chart"));
} catch (error) {
  if (error instanceof LinkTooLongError) showMessage(error.message); // error.length, error.maxLength
  else throw error;
}
```

`parseImageLink(url)` reads a link back (`{format, block, theme, scale, baseUrl}`), and `encodeBlock` and `decodeBlock` do the `pako:` part alone. A link is at most `MAX_LINK_LENGTH` (8,000) characters by default: RFC 9110 asks servers for at least 8,000, Vercel stops at 14 KB and Cloudflare at 16 KB, and image proxies (camo writes the URL again in hex) and chat apps lower that further. A longer link is an error, never a truncated link: such a block belongs in a committed SVG file (`plotdown render`) or in a POST. A link is about a fifth of its block's length (measured on the fixtures: 3 KB blocks give 610 to 655 characters), so 8,000 characters hold roughly 35 KB of JSON, less for data with many distinct numbers.

From the command line: `plotdown link chart.json`, `plotdown link --png --scale 2 -m < chart.json`, `plotdown link readme.md` (each block), and `plotdown render --link readme.md`, which writes links instead of SVG files (`--png`, `--base-url`, `--check` as for `render`).
