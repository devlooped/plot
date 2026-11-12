# Permissions and their justification

Text for the Chrome Web Store's "Privacy practices" tab, Edge's certification notes and AMO's reviewer notes.

## Single purpose

> plotdown has one purpose: to show fenced `plot` code blocks of JSON, on the pages the user reads, as the Observable Plot charts they describe.

## Permissions

| Permission | Why |
| --- | --- |
| Host access to all sites (`http://*/*`, `https://*/*`), and a content script on all sites | Plot blocks appear on any site that shows Markdown: GitHub, GitLab (also self-hosted on any domain), Bitbucket, Gitea, Forgejo, Azure DevOps, AI chats, documentation sites and blogs. A list of sites cannot cover self-hosted instances. On every page, a small content script (7 kB) only looks for a plot block, by the markup of code blocks; it reads nothing else and sends nothing. The renderer is injected only into pages that have a block. |
| `scripting` | To inject the renderer (`plotdown.iife.js`, inside the extension) into the frame that has a plot block, only when there is one, so that other pages do not load it. In the known-hosts build, also to register the detector on a site the user allows. |
| `storage` | To keep the user's switches (on or off everywhere, and the sites where it is off), in local storage. |
| `activeTab` | So that the popup knows the site of the current tab and can show its switch, also on a site the extension has no access to yet. |

## Remote code

> No. All of the code is in the package. `plotdown.iife.js` is the renderer (the plotdown core, Observable Plot and d3, bundled and minified from the open-source repository); it is injected from the package with `chrome.scripting.executeScript({files})`. No code or configuration is fetched; the extension makes no network request, and the renderer is configured to load no remote data.

## Data usage

Chrome Web Store certification: the extension collects none of the listed kinds of data (personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity, website content). Website content is read in the page, only to find and draw plot blocks, and never leaves it.

Firefox: `"data_collection_permissions": {"required": ["none"]}` in the manifest.

## If the access to all sites is refused

Build the known-hosts variant (`node build.mjs --sites=known`, then `pnpm pack`): host access only to github.com, gist.github.com, gitlab.com, bitbucket.org, codeberg.org, gitea.com, dev.azure.com, chatgpt.com, claude.ai and gemini.google.com, and access to any other site as an optional permission that the user grants from the popup, one site at a time. The justification of host access then becomes:

> The extension shows plot blocks as charts on the code hosting and AI chat sites where they are written. Other sites, such as a self-hosted GitLab, are added by the user one at a time from the extension's popup.
