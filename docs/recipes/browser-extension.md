# Browser extension and userscript

The plotdown extension for Chrome, Edge and Firefox draws `plot`, `oplot` and `observable-plot` blocks on the pages you read, where the site does nothing for them: GitHub issues, pull requests, comments, READMEs and gists; GitLab, gitlab.com or self-hosted; Bitbucket; Gitea, Forgejo and Codeberg; Azure DevOps; the answers of ChatGPT, Claude and Gemini; any page that shows Markdown code blocks. Only you see the charts: the page does not change for other readers.

> [!WARNING]
> The extension is **not in the Chrome Web Store, Edge Add-ons or Firefox Add-ons yet**. Today, build it from the repository and load it unpacked, or use the userscript.

## What it does

It is [`plotdown.js`](./script-tag.md), the script a site owner adds with one line, put in the page by your browser instead. A small detector runs on every page; only a page with a candidate block receives `plotdown.js`, which draws each block before it, with a **Source** button. Remote data stays off whatever the page says. The toolbar button turns plotdown off for the current site, or everywhere. The extension collects nothing and sends nothing: see its [privacy policy](https://plotdown.cc/privacy/).

## Load it unpacked

From a clone of the [repository](https://github.com/devlooped/plotdown), with Node 24 and pnpm 10:

```sh
pnpm install
pnpm build                  # writes packages/extension/dist/
```

- **Chrome or Edge**: open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, press **Load unpacked** and pick `packages/extension/dist/chrome`.
- **Firefox** (153 or later): open `about:debugging#/runtime/this-firefox`, press **Load Temporary Add-on** and pick `packages/extension/dist/firefox/manifest.json`. A temporary add-on is removed when Firefox closes.

The browser warns that the extension can read all sites: that is what lets it work on a self-hosted GitLab or any other page without setup. A variant limited to the known sites is built with `node build.mjs --sites=known` in `packages/extension`; it asks for any other site when you turn it on there.

## The userscript

`pnpm build` also writes `packages/extension/dist/plotdown.user.js`: `plotdown.js` under a userscript header (`@match *://*/*`, `@grant none`), with the same detector, for Tampermonkey, Violentmonkey or Greasemonkey. Open the file in the browser with the manager installed, or paste it into a new script. Use the manager's per-site exclusions to turn it off somewhere. It does not update by itself: build it again for a new version.

## Check it

Open a page with a block, such as the [readme of plotdown on GitHub](https://github.com/devlooped/plotdown): the blocks above the committed images become live charts with tips, and a **Source** button. A real gnuplot block on GitHub, whose markup is that of a `plot` block, stays code.

More, including the tests and the store packages: [`packages/extension`](../../packages/extension/readme.md).

> [!NOTE]
> Written from the extension's documentation; this page was not tried by hand. The extension's own browser tests load it unpacked in Chromium and in Firefox: github.com, a page under a strict CSP, a streamed block, the switches, and the userscript.
