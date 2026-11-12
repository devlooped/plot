# Store listing

The same text for the Chrome Web Store, Edge Add-ons and Firefox Add-ons (AMO).

## Name

plotdown

## Summary

Chrome "short description" and AMO "summary" (132 characters at most; also the `description` of the manifest):

> Renders plot code blocks of JSON as Observable Plot charts on GitHub, GitLab, AI chats and any page you read.

## Category

- Chrome Web Store: Developer Tools
- Edge Add-ons: Developer tools
- AMO: Other (or "Appearance"), tag `markdown`, `charts`, `github`

## Description

> **Charts in Markdown, everywhere you read it.**
>
> plotdown turns fenced `plot` code blocks into Observable Plot charts. A block holds the options of Observable Plot as JSON, with marks and transforms as data:
>
> ```plot
> {
>   "marks": [
>     {"mark": "barY", "data": [{"lang": "JS", "repos": 31}, {"lang": "Go", "repos": 14}], "x": "lang", "y": "repos"}
>   ]
> }
> ```
>
> With the extension, such blocks show as charts on GitHub (READMEs, issues, pull requests, comments, gists), GitLab (gitlab.com and self-hosted), Bitbucket, Gitea, Forgejo and Codeberg, Azure DevOps, AI chats such as ChatGPT, Claude and Gemini, and any page that shows Markdown code blocks. A button on each chart shows its source again.
>
> - **Works on any site.** The blocks `plot`, `oplot` and `observable-plot` are found by their markup, with no setup per site.
> - **Light on the pages you visit.** A tiny detector looks for a plot block; the renderer is added only to pages that have one.
> - **Safe with blocks written by anyone.** A block is data: nothing in it is run as code. Links are limited to http, https and mailto, and data or images from the network are never loaded.
> - **Private.** Charts are drawn in your browser. The extension collects nothing and sends nothing.
> - **Your switches.** Turn it off for a site, or everywhere, from its toolbar button.
>
> The format is open and documented at https://github.com/devlooped/plotdown, with a CLI and a GitHub Action that turn the same blocks into images, and plugins for Markdown tools, React, VS Code, Obsidian and AI agents.
>
> plotdown is open source (MIT) and not affiliated with Observable, Inc. Observable Plot is © Observable, Inc., under the ISC license.

## Links

- Homepage: https://github.com/devlooped/plotdown (later https://plotdown.cc)
- Support: https://github.com/devlooped/plotdown/issues
- Privacy policy: [privacy.md](privacy.md), published at a URL (for example https://github.com/devlooped/plotdown/blob/main/packages/extension/store/privacy.md)

## Images

In [`images/`](images):

| File | Size | For |
| --- | --- | --- |
| `../icons/icon-128.png` | 128×128 | store icon (Chrome, AMO) |
| `logo-300x300.png` | 300×300 | Edge store logo |
| `screenshot-github-1280x800.png` | 1280×800 | screenshot: SKILL.md on github.com with the extension (all three stores) |
| `promo-small-440x280.png` | 440×280 | Chrome small promotional tile (required), Edge small promotional tile |
| `promo-marquee-1400x560.png` | 1400×560 | Chrome marquee and Edge large promotional tile (optional) |

More screenshots (an issue comment, a GitLab README, a chat answer, the dark theme) would help the listing; `PLOTDOWN_STORE_IMAGES=1 pnpm test:browser` writes the GitHub one again.
