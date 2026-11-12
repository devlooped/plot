# plotdown with VitePress

```sh
pnpm --filter @devlooped/plotdown build   # from the repository root, once
pnpm install --ignore-workspace
pnpm build                                # writes docs/.vitepress/dist
```

[`docs/.vitepress/config.mts`](docs/.vitepress/config.mts) adds the markdown-it plugin with `markdown.config: (md) => md.use(plotdown)`.
