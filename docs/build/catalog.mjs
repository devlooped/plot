// @ts-check
// What the site lists: the recipes by route, and the titles of the gallery.

export const SITE = "https://plotdown.cc";
export const REPO = "https://github.com/devlooped/plotdown";
export const SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js";

/**
 * @typedef {object} Recipe
 * @property {string} slug The file docs/recipes/<slug>.md, served at /recipes/<slug>/.
 * @property {string} name The short name in lists.
 * @property {string} what What the reader adds, in a few words.
 */

/**
 * @typedef {object} RecipeGroup
 * @property {string} id
 * @property {string} title
 * @property {string} who Who takes the step.
 * @property {string} how What the step is.
 * @property {Recipe[]} recipes
 */

/** @type {RecipeGroup[]} */
export const GROUPS = [
  {
    id: "pages",
    title: "Sites you publish",
    who: "The site owner",
    how: "adds one script tag. plotdown.js finds the blocks in the HTML your tool writes and draws them in the reader's browser.",
    recipes: [
      {slug: "script-tag", name: "Any HTML page", what: "One script tag"},
      {slug: "jekyll", name: "Jekyll and GitHub Pages", what: "A head include"},
      {slug: "hugo", name: "Hugo", what: "A code block render hook"},
      {slug: "mkdocs", name: "MkDocs", what: "custom_fences"},
      {slug: "mdbook", name: "mdBook", what: "additional-js"},
      {slug: "docsify", name: "Docsify", what: "A script tag"},
      {slug: "pandoc", name: "Pandoc and Quarto", what: "A Lua filter"},
      {slug: "gitea", name: "Gitea and Forgejo", what: "A footer template"}
    ]
  },
  {
    id: "parsers",
    title: "Markdown pipelines",
    who: "The developer",
    how: "adds a parser plugin. The chart is drawn when the page is built, so the page ships the SVG and needs no script.",
    recipes: [
      {slug: "vitepress", name: "VitePress", what: "markdown-it plugin"},
      {slug: "docusaurus", name: "Docusaurus", what: "rehype plugin"},
      {slug: "astro", name: "Astro", what: "rehype plugin"},
      {slug: "markdown-it", name: "markdown-it", what: "md.use(plotdown)"},
      {slug: "rehype", name: "unified and rehype", what: "rehypePlugins"},
      {slug: "marked", name: "marked", what: "marked.use(plotdown())"}
    ]
  },
  {
    id: "apps",
    title: "Apps and chat interfaces",
    who: "The developer",
    how: "renders a component. A block still streaming shows a placeholder, then the chart once its JSON is complete.",
    recipes: [{slug: "react", name: "React and Streamdown", what: "<Plotdown> or plotRenderer"}]
  },
  {
    id: "hosts",
    title: "GitHub and GitLab",
    who: "The repository owner",
    how: "commits an SVG next to each block, or links an image. Readers need nothing.",
    recipes: [
      {slug: "github", name: "GitHub", what: "Action, extension, image links"},
      {slug: "gitlab-ci", name: "GitLab", what: "A CI job"}
    ]
  },
  {
    id: "tools",
    title: "Editors and agents",
    who: "You",
    how: "install a plugin, or give your model the skill so that it writes valid blocks.",
    recipes: [
      {slug: "obsidian", name: "Obsidian", what: "A community plugin"},
      {slug: "mcp", name: "MCP hosts", what: "An MCP App server"},
      {slug: "agent-skill", name: "Agent skill", what: "SKILL.md and llms.txt"}
    ]
  }
];

/** The fixtures of spec/fixtures, by file name: the title the gallery shows. */
export const FIXTURE_TITLES = {
  "area-stacked": "Stacked areas",
  "arrow-change": "Arrows between two values",
  "auto-bar": "The auto mark",
  "axis-custom": "Axes as marks",
  "bar-group": "Grouped bars",
  "bollinger": "Bollinger bands",
  "box-tsv": "Box plot from TSV",
  "cell-heatmap": "A heatmap of cells",
  "contour": "Contours",
  "delaunay-voronoi": "Voronoi and Delaunay",
  "density": "Density contours",
  "difference-shift": "Difference of a shifted series",
  "dot-dodge": "Beeswarm",
  "dot-scatter": "Scatter plot",
  "frame-facet": "Facets with frames",
  "geo-orthographic": "A globe",
  "hexbin": "Hexagonal bins",
  "image-logos": "Images",
  "line-cumsum": "Running total",
  "line-normalize": "Normalized lines",
  "line-window": "Moving average",
  "linear-regression": "Linear regression",
  "link-arcs": "Links",
  "raster": "Raster",
  "rect-bin-csv": "Histogram from CSV",
  "rule-tick": "Rules and ticks",
  "tree-transforms": "Tree transforms",
  "tree": "Tree",
  "vector-wind": "Vectors",
  "waffle": "Waffle"
};

/** The fixtures the home page shows, in order. */
export const HOME_GALLERY = ["area-stacked", "contour", "bollinger", "delaunay-voronoi", "bar-group", "waffle"];
