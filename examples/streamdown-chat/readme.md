# plotdown with Streamdown

A small chat that streams a canned answer holding a plot block (no API key): the block shows a placeholder while it streams and the chart when its fence closes.

```sh
pnpm --filter @devlooped/plotdown build   # from the repository root, once
pnpm install --ignore-workspace
pnpm dev                                  # or pnpm build
```

The whole integration is one line of [`src/App.jsx`](src/App.jsx):

```jsx
<Streamdown plugins={{renderers: [plotRenderer]}} isAnimating={streaming}>{text}</Streamdown>
```
