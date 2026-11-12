# Pandoc sample

Build: `pandoc docs/recipes/samples/pandoc/sample.md -s --lua-filter docs/recipes/samples/pandoc/plotdown.lua -o <out-dir>/index.html`
Check: `node docs/recipes/samples/check.mjs <out-dir> index.html`
Recipe: [../../pandoc.md](../../pandoc.md)
