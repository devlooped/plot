import {defineConfig} from "astro/config";
import starlight from "@astrojs/starlight";
import rehypePlotdown from "@devlooped/plotdown/rehype";

export default defineConfig({
  integrations: [starlight({title: "plotdown sample"})],
  markdown: {
    rehypePlugins: [rehypePlotdown]
  }
});
