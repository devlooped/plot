# Image links

Where nothing runs plotdown and you cannot commit a file, such as an issue or pull request comment, a chat message, an email or a Notion page, link an image from `plotdown.cc`: the URL holds the block, and the service draws it as an SVG or a PNG.

```markdown
![Penguin body mass](https://plotdown.cc/svg/pako:eNqFUz1PwzAU3PkVlieQP…)
```

The block is compressed and written in the URL (`pako:` and base64url, as mermaid.ink and Kroki do). The service stores nothing. A URL always draws the same image, so caches keep it for good.

## Get a link

- **In the [playground](https://plotdown.cc/playground/)**: choose what **Copy image link** copies (*Markdown (SVG)*, *SVG link* or *PNG link*), then press it. It refuses a block with a mistake, and a block too long for a URL.
- **With the [CLI](./cli.md)**, from a block kept in a file of its own (`*.plotdown.json`), from standard input, or from each block of a Markdown file in turn:

  ```sh
  npx @devlooped/plotdown link chart.plotdown.json              # https://plotdown.cc/svg/pako:…
  npx @devlooped/plotdown link --png --scale 2 -m readme.md     # ![Title](https://plotdown.cc/png/pako:…?scale=2), one per block
  ```

- **In a Markdown file**, in place of committed SVG files: `plotdown render --link` puts an image link after each block, and removes the SVG files an earlier run wrote for that file:

  ````markdown
  ```plot
  {"title": "Penguins", "marks": [ … ]}
  ```
  ![Penguins](https://plotdown.cc/svg/pako:eNodyTsKwCAQ…) <!-- plot:96508a -->
  ````

  Add `--png` for PNG links. A second run changes nothing; a changed block gets a new link.
- **From code**: `imageLink(block, {format, theme, scale})` and `markdownImage(url, alt)` of `@devlooped/plotdown/link`, which runs in Node and in browsers.

## SVG or PNG

| | SVG (`/svg/…`) | PNG (`/png/…`) |
| --- | --- | --- |
| Shown by | GitHub, GitLab, Gitea, most Markdown pages, browsers | Everything that shows images: Slack, Discord, Teams, email clients, Notion |
| Light and dark | Follows the reader (`?theme=auto`, the default), or `?theme=light`, `?theme=dark` | Fixed: `light` (default) or `?theme=dark` |
| Size | Sharp at any size | `?scale=2` (or 3, 4) for high-density screens |

A block that cannot be drawn gets an image that says why, with the JSON path of the mistake. For a block too long for a URL (about 8,000 characters), the link is refused: commit an SVG file instead, or `POST` the block to `https://plotdown.cc/svg` or `/png`.

## Links or committed SVG files

Prefer [committed SVG files](./github.md) (`plotdown render`, or the GitHub Action) for a README and documentation in a repository:

- **They do not depend on a service.** A link shows nothing if `plotdown.cc` is down or gone; a file in the repository stays.
- **The data stays with the file.** A link carries the whole block, data included, to whoever opens it, and to the service, its logs and the image proxies on the way. Do not put in a link what you would not publish.
- **Long blocks fit.** A file has no length limit.

Links are for the places where no file can go: comments, chats, email, a tool that only takes an image URL. They need no CI and no write access.

## The service

`https://plotdown.cc/svg/…` and `/png/…` are open to everyone, without a key, with a rate limit per address. The service never fetches anything: a block with a data URL or a remote image is refused. Its routes, limits and error codes are in [the service's readme](../../packages/service/readme.md), with how to run it yourself (`plotdown link --base-url <your service>`).

> [!NOTE]
> Tried on 2026-11-12: `plotdown link` and `plotdown render --link` installed from the packed npm package, and `https://plotdown.cc/svg/pako:…` answering the SVG of the link they wrote. The playground's button and the rendering in Slack or email were not tried.
