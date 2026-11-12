import rehypePlotdown from "@devlooped/plotdown/rehype";

/** @type {import("@docusaurus/types").Config} */
export default {
  title: "plotdown + Docusaurus",
  url: "https://example.com",
  baseUrl: "/",
  onBrokenLinks: "throw",
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: false,
          // Charts become part of the MDX tree at build time (linkedom provides the document).
          rehypePlugins: [rehypePlotdown]
        },
        blog: false,
        theme: {customCss: "./custom.css"}
      }
    ]
  ]
};
