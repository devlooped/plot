# Submitting to the stores

Version 0.1.0 was submitted to all three stores on 2026-11-12, with access to all sites:

| Store | Item | Dashboard |
| --- | --- | --- |
| Chrome Web Store | `bfocmoajfklbeknglkfmpcnpkfnoocng` | [developer dashboard](https://chrome.google.com/webstore/devconsole) |
| Edge Add-ons | product `65da8bdd-10e4-4278-9f29-2851237689cb`, Store ID `0RDCKD4DHBV5` | [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) |
| Firefox Add-ons | `plotdown@devlooped.com`, [addons.mozilla.org/firefox/addon/plotdown](https://addons.mozilla.org/firefox/addon/plotdown/) | [AMO developer hub](https://addons.mozilla.org/developers/addon/plotdown/versions) |

For a new version: raise `version` in `package.json`, build and pack, then upload the zips to the same items. The rest of this page describes what each store takes and how the first submission was prepared.

## Packages

```sh
pnpm install && pnpm build                      # at the root
pnpm --filter plotdown-extension pack           # dist/stores/*.zip
```

| File | Store |
| --- | --- |
| `dist/stores/plotdown-chrome-<version>.zip` | Chrome Web Store and Microsoft Edge Add-ons (the same package) |
| `dist/stores/plotdown-firefox-<version>.zip` | Firefox Add-ons (AMO) |
| `dist/stores/plotdown-source-<version>.zip` | AMO's source code upload: `git archive` of the commit the package was built from |
| `dist/stores/plotdown-*-known-<version>.zip` | the known-hosts variant, if built with `node build.mjs --sites=known` first |

The version is that of `packages/extension/package.json`; raise it for each upload (stores refuse a version they already have).

## Ready

- Manifests (Manifest V3), icons (16, 32, 48, 96, 128), promotional images and a 1280×800 screenshot: [`images/`](images), [`../icons/`](../icons).
- Listing text, category and links: [`listing.md`](listing.md).
- Single purpose, permission justifications, remote code and data usage answers: [`permissions.md`](permissions.md).
- Privacy policy: [`privacy.md`](privacy.md), published by the site at https://plotdown.cc/privacy/.

## Left to do

1. **Privacy policy URL**: https://plotdown.cc/privacy/ (built from `privacy.md` with the site; check that it is live before submitting).
2. **Chrome Web Store** ([developer dashboard](https://chrome.google.com/webstore/devconsole), one-time registration fee): new item, upload `plotdown-chrome-<version>.zip`; fill in the store listing from `listing.md` with the images; the privacy tab from `permissions.md`; distribution public. Expect a longer review for the access to all sites.
3. **Microsoft Edge Add-ons** ([Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)): new extension, upload the same zip; properties, listing (logo 300×300, screenshot, small promotional tile) and notes for certification from `permissions.md`.
4. **Firefox Add-ons** ([AMO developer hub](https://addons.mozilla.org/developers/)): submit a new add-on "On this site", upload `plotdown-firefox-<version>.zip`; answer "yes" to minified code and upload `plotdown-source-<version>.zip`, with these build steps for the reviewer:

   > Requires Node 24 and pnpm 10.32 (corepack enable). From the root of the archive: `pnpm install --frozen-lockfile && pnpm build`. The add-on is `packages/extension/dist/firefox`; `plotdown.iife.js` is built from `packages/plotdown` (tsup, `tsup.browser.config.ts`) and copied unchanged except for its source map comment.

   The add-on id is `plotdown@devlooped.com` (`GECKO_ID` in `manifest.mjs`): AMO ties it to the listing for good, so change it before the first upload if another id is wanted.
5. **Check by hand** what automation could not: in each browser, install from the zip; click the toolbar button on a site the extension cannot access (Chrome: site access "on click") and use **Allow on _site_**, which goes through the browser's permission prompt; the popup on a page of charts; the dark theme of github.com.
6. If a store refuses the access to all sites, submit the known-hosts variant instead, with the justification at the end of `permissions.md`.

## Store requirements this was prepared against

- Chrome Web Store: a 128×128 icon, at least one screenshot (1280×800 or 640×400), the 440×280 small promotional tile, a single purpose, a justification of each permission, the remote code declaration and the data usage certification.
- Edge Add-ons: the same package format as Chrome; a store logo (300×300 recommended), screenshots and promotional tiles optional.
- AMO: a gecko `id` (required for Manifest V3), `data_collection_permissions` (required for new add-ons since November 2025), and the source of any minified or bundled code with instructions to build it.
