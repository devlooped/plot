import plotdown from "@devlooped/plotdown/markdown-it";
import {defineConfig} from "vitepress";

export default defineConfig({
  title: "plotdown + VitePress",
  markdown: {
    // Charts are inline SVG made when VitePress renders the Markdown (linkedom provides the document).
    config: (md) => md.use(plotdown)
  }
});
