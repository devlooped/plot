# plotdown with marked

```sh
pnpm --filter @devlooped/plotdown build   # from the repository root, once
pnpm install --ignore-workspace
pnpm build                                # writes dist/index.html
```

[`build.mjs`](build.mjs) converts [`sample.md`](sample.md) with `marked.use(plotdown())`: each plot block becomes an inline SVG chart at build time, and the broken block stays code with its error under it.
