# plotdown privacy policy

_Applies to the plotdown browser extension for Chrome, Edge and Firefox, and to the plotdown userscript._

**plotdown collects no data and makes no network request.**

- **What it reads.** On the pages you visit, a small script looks for code blocks marked `plot`, `oplot` or `observable-plot`. When a page has one, plotdown reads the text of the block and draws it as a chart, in your browser, on that page. The text of the blocks and the content of the pages are never stored, copied elsewhere or sent anywhere.
- **What it stores.** Your switches (whether plotdown is on, and the sites where you turned it off) are kept in your browser's extension storage on your computer. While the browser runs, it also keeps in memory the addresses of the last pages where it added its renderer (at most 50), a record for diagnosing problems; this list never leaves the browser and is erased when the browser closes.
- **What it sends.** Nothing. The extension contains all of its code and makes no request: no analytics, no telemetry, no crash reports, no remote configuration. Data or images that a block points to on the network are not loaded.
- **Third parties.** None. No data is sold, shared or transferred.
- **Permissions.** Access to the sites you visit is used only to find plot blocks and draw them on the page; see [permissions.md](permissions.md).

Questions: https://github.com/devlooped/plotdown/issues.

Last updated: 2026-11-12.
