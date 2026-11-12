# Script tag sample

Pages in `public/`: `index.html` (module), `classic.html` (classic script, `plotdownConfig`, dark), `csp.html` (strict CSP, self-hosted), `api.html` + `api.js` (`data-auto="false"`, `start`, `BlockRenderer`).
Before `csp.html`: copy `plotdown.js` from `node_modules/@devlooped/plotdown/dist/` into `public/`. Check: `node docs/recipes/samples/check.mjs docs/recipes/samples/script-tag/public index.html classic.html csp.html api.html`
Recipe: [../../script-tag.md](../../script-tag.md)
