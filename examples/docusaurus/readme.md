# plotdown with Docusaurus

```sh
pnpm --filter @devlooped/plotdown build   # from the repository root, once
pnpm install --ignore-workspace
pnpm build                                # writes build/
```

[`docusaurus.config.mjs`](docusaurus.config.mjs) adds the rehype plugin to the docs: `rehypePlugins: [rehypePlotdown]`. The charts become MDX elements at build time, so they are in the HTML of the page and in its React bundle.
