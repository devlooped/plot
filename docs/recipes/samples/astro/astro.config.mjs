import {defineConfig} from "astro/config";
import rehypePlotdown from "@devlooped/plotdown/rehype";

export default defineConfig({
  markdown: {
    // Shiki runs before rehypePlugins: leave plot blocks to plotdown.
    syntaxHighlight: {type: "shiki", excludeLangs: ["plot", "oplot", "observable-plot"]},
    rehypePlugins: [rehypePlotdown]
  }
});
