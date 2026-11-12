# rehype

A rehype plugin turns `plot` fences into charts in any unified pipeline: Plot's SVG goes into the tree as elements, so it works for HTML and MDX alike. It is what [Docusaurus](./docusaurus.md) and [Astro](./astro.md) use.

## Install and use

```sh
npm i @devlooped/plotdown linkedom
```

```js
import {unified} from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypePlotdown from "@devlooped/plotdown/rehype";

const file = await unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypePlotdown)
  .use(rehypeStringify)
  .process(source);
```

The plugin finds `<pre><code class="language-plot">` (and `oplot`, `observable-plot`), as remark-rehype writes fences. Put it **before** a highlighter such as `rehype-highlight` or `@shikijs/rehype`: a highlighter that rewrites the `<pre>` hides the fence name.

````markdown
```plot
{
  "y": {"grid": true},
  "marks": [
    {"mark": "barY", "data": [{"species": "Adelie", "mass": 3750}, {"species": "Gentoo", "mass": 5000}], "x": "species", "y": "mass", "fill": "species"},
    {"mark": "ruleY", "data": [0]}
  ]
}
```
````

The [spec](https://plotdown.cc/spec/) lists the marks and options; the [playground](https://plotdown.cc/playground/) checks a block as you type.

## Options

```js
.use(rehypePlotdown, {
  allowRemote: ["https://data.example"],  // or true; off by default
  strict: false,                           // true: a broken block fails the build
  mode: "inline"                           // or "client": leave the blocks for plotdown.js
})
```

The plugin is async: with `allowRemote`, it loads `{"url": …}` data while it runs, and the chart is drawn from it. A block that fails stays code with the reason in `<p class="plotdown-message">`, and its reason is a message on the file (`file.messages`).

## Next.js MDX and Nextra

Not tried; from each tool's MDX options:

- **`@next/mdx`**: `createMDX({options: {rehypePlugins: [["@devlooped/plotdown/rehype", {}]]}})`; with Turbopack, plugins are named as strings.
- **Nextra**: `nextra({mdxOptions: {rehypePlugins: [rehypePlotdown]}})`.

Both run at build time on the server, so install `linkedom` there.

> [!NOTE]
> Tried with unified 11.0.5, remark-rehype 11.1.2 and rehype-stringify 10.0.1 in Node 24 on 2026-11-12, with remote data loaded at build time.
