// @ts-check
// The HTML of the pages that are not Markdown files: home, gallery, recipe
// index, playground, 404. Charts are plot blocks: plotdown.js draws them in the
// page, except the one of the hero, which the build draws with the core.
import {GROUPS, HOME_GALLERY} from "./catalog.mjs";
import {escapeHtml} from "./layout.mjs";

/**
 * @typedef {object} Fixture
 * @property {string} name
 * @property {string} title
 * @property {string} text The JSON, with LF line ends.
 * @property {string[]} marks
 * @property {string[]} transforms
 */

/**
 * @typedef {object} RecipeInfo
 * @property {string} slug
 * @property {string} title The H1 of the page.
 * @property {"tried" | "docs" | "unknown"} status
 */

/** The block of the hero: hours of daylight in two cities, by month. */
export const HERO_BLOCK = `{
  "title": "Hours of daylight",
  "subtitle": "Oslo and Buenos Aires, on the 15th of each month",
  "data": {"sun": [
    {"month": "Jan", "Oslo": 6.9, "Buenos Aires": 14.2},
    {"month": "Feb", "Oslo": 9.2, "Buenos Aires": 13.2},
    {"month": "Mar", "Oslo": 11.8, "Buenos Aires": 12.1},
    {"month": "Apr", "Oslo": 14.6, "Buenos Aires": 11.0},
    {"month": "May", "Oslo": 17.2, "Buenos Aires": 10.1},
    {"month": "Jun", "Oslo": 18.8, "Buenos Aires": 9.7},
    {"month": "Jul", "Oslo": 18.1, "Buenos Aires": 9.9},
    {"month": "Aug", "Oslo": 15.7, "Buenos Aires": 10.7},
    {"month": "Sep", "Oslo": 12.9, "Buenos Aires": 11.8},
    {"month": "Oct", "Oslo": 10.1, "Buenos Aires": 12.9},
    {"month": "Nov", "Oslo": 7.5, "Buenos Aires": 13.9},
    {"month": "Dec", "Oslo": 6.0, "Buenos Aires": 14.4}
  ]},
  "x": {"domain": ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], "label": null},
  "y": {"domain": [0, 20], "grid": true, "label": "Hours"},
  "marks": [
    {"mark": "ruleY", "data": [12], "strokeDasharray": "2,3"},
    {"mark": "lineY", "data": "sun", "x": "month", "y": "Oslo",
     "stroke": "#5079e0", "strokeWidth": 2.5,
     "curve": "catmull-rom", "marker": "circle"},
    {"mark": "lineY", "data": "sun", "x": "month", "y": "Buenos Aires",
     "stroke": "#e8a10c", "strokeWidth": 2.5,
     "curve": "catmull-rom", "marker": "circle"},
    {"mark": "text", "data": [0], "x": ["Jun"], "y": [18.8],
     "text": ["Oslo"], "dy": -14, "fill": "#5079e0",
     "fontSize": 13, "fontWeight": "bold"},
    {"mark": "text", "data": [0], "x": ["Jun"], "y": [9.7],
     "text": ["Buenos Aires"], "dy": 16, "fill": "#e8a10c",
     "fontSize": 13, "fontWeight": "bold"}
  ]
}`;

/**
 * @param {Fixture} fixture
 * @param {{heading?: string}} [options]
 */
function specimen(fixture, options = {}) {
  const tag = options.heading ?? "h3";
  return `<figure class="specimen" id="${fixture.name}">
<${tag} class="specimen-title"><a href="/playground/?example=${fixture.name}">${escapeHtml(fixture.title)}</a></${tag}>
<pre class="plot-source"><code class="language-plot">${escapeHtml(fixture.text)}</code></pre>
<figcaption>${uses(fixture)} <a class="edit" href="/playground/?example=${fixture.name}">Edit in the playground</a></figcaption>
</figure>`;
}

/** @param {Fixture} fixture */
function uses(fixture) {
  const code = (/** @type {string[]} */ names) => names.map((name) => `<code>${escapeHtml(name)}</code>`).join(", ");
  const marks = `${fixture.marks.length === 1 ? "Mark" : "Marks"} ${code(fixture.marks)}`;
  const transforms = fixture.transforms.length ? `; ${fixture.transforms.length === 1 ? "transform" : "transforms"} ${code(fixture.transforms)}` : "";
  return `<span class="uses">${marks}${transforms}.</span>`;
}

/**
 * @param {{heroSource: string, heroChart: string, fixtures: Fixture[], recipes: Map<string, RecipeInfo>, specMarkdown: string, specJs: string, schemaUrl: string}} input
 */
export function homeBody(input) {
  const byName = new Map(input.fixtures.map((fixture) => [fixture.name, fixture]));
  const gallery = HOME_GALLERY.map((name) => byName.get(name))
    .filter((fixture) => fixture !== undefined)
    .map((fixture) => specimen(fixture))
    .join("\n");
  return `
<section class="hero" aria-labelledby="hero-title">
  <div class="hero-text">
    <h1 id="hero-title">Charts you write in Markdown</h1>
    <p class="lede">A <code>plot</code> block holds the options of Observable&nbsp;Plot as plain JSON. plotdown draws it as a chart on GitHub and GitLab, on your docs site, in your editor and in your chat app.</p>
    <p class="actions"><a class="button primary" href="/playground/">Open the playground</a> <a class="button" href="/recipes/">Find your setup</a></p>
  </div>
  <div class="fold" role="group" aria-label="A plot block and the chart it becomes">
    <div class="fold-source">
      <p class="fold-label" id="hero-source">The block, in your Markdown file</p>
      ${input.heroSource}
    </div>
    <div class="fold-chart">
      <p class="fold-label">What the reader sees</p>
      <div class="plotdown hero-chart">${input.heroChart}</div>
      <p class="fold-note"><a href="/playground/?example=hero">Change it in the playground</a></p>
    </div>
  </div>
</section>

<section class="band routes" aria-labelledby="routes-title">
  <div class="band-head">
    <h2 id="routes-title">One block, wherever Markdown is read</h2>
    <p>Write the block once. Each place that shows Markdown needs one small step, taken once, by the person who runs it.</p>
  </div>
  ${routes(input.recipes)}
</section>

<section class="band" aria-labelledby="gallery-title">
  <div class="band-head">
    <h2 id="gallery-title">Real charts, written as blocks</h2>
    <p>Each chart on this page is a <code>plot</code> block that <a href="/plotdown.js">plotdown.js</a> found and drew in your browser. Press <em>Source</em> on any of them to read its block.</p>
  </div>
  <div class="specimens">
${gallery}
  </div>
  <p class="more"><a href="/gallery/">See all 30 examples, one for each kind of mark</a></p>
</section>

<section class="band format" aria-labelledby="format-title">
  <div class="band-head">
    <h2 id="format-title">The format is Plot's own options</h2>
    <p>If you know <code>Plot.plot()</code>, you know the block. Each mark is an object named by <code>"mark"</code>, each transform an entry of <code>"transform"</code>, and fields are named by strings.</p>
  </div>
  <div class="pair">
    <div><p class="pair-label">In Markdown</p>${input.specMarkdown}</div>
    <div><p class="pair-label">The same chart in JavaScript</p>${input.specJs}</div>
  </div>
  <div class="facts">
    <p><strong>Strict JSON, nothing to run.</strong> Any language can read and check a block. A renderer evaluates nothing, so blocks from strangers or from a model are safe to show.</p>
    <p><strong>Errors name the place.</strong> An unknown key, mark or reducer is an error with its JSON path, such as <code>$.marks[1].transform[0].binX.y</code>, instead of a chart that is silently wrong.</p>
    <p><strong>No network by default.</strong> Data sits in the block, as rows or CSV. Loading a URL is something the host turns on.</p>
  </div>
  <p class="more"><a href="/spec/">Read the spec</a> or validate with the <a href="${input.schemaUrl}">JSON Schema</a>.</p>
</section>

<section class="band agents" aria-labelledby="agents-title">
  <div class="band-head">
    <h2 id="agents-title">Models can write it too</h2>
    <p>Ask for a chart and a model answers with a block, if it knows the format. Give it the skill, or point it at the guide.</p>
  </div>
  <ul class="links">
    <li><a href="/recipes/agent-skill/">The agent skill</a>: <code>SKILL.md</code> for Claude Code, Codex, Copilot and other agents that read skills.</li>
    <li><a href="/llms.txt">llms.txt</a> and <a href="/llms-full.txt">llms-full.txt</a>: the rules, the catalog of marks and 30 examples, for any system prompt.</li>
    <li><a href="${input.schemaUrl}">plot.schema.json</a>: JSON Schema 2020-12, for structured outputs and editors.</li>
    <li><a href="/recipes/mcp/">The MCP App</a>: a <code>render_plot</code> tool that shows the chart inside Claude, ChatGPT and VS Code.</li>
  </ul>
</section>
`;
}

/** @param {Map<string, RecipeInfo>} recipes */
function routes(recipes) {
  return `<div class="route-list">
${GROUPS.map(
  (group) => `  <section class="route" aria-labelledby="route-${group.id}">
    <h3 id="route-${group.id}">${escapeHtml(group.title)}</h3>
    <p>${escapeHtml(group.who)} ${escapeHtml(group.how)}</p>
    <ul>
${group.recipes.map((recipe) => `      <li>${recipeLink(recipe, recipes)} <span>${escapeHtml(recipe.what)}</span></li>`).join("\n")}
    </ul>
  </section>`
).join("\n")}
</div>`;
}

/**
 * @param {{slug: string, name: string}} recipe
 * @param {Map<string, RecipeInfo>} recipes
 */
function recipeLink(recipe, recipes) {
  return recipes.has(recipe.slug) ? `<a href="/recipes/${recipe.slug}/">${escapeHtml(recipe.name)}</a>` : `<span class="missing">${escapeHtml(recipe.name)}</span>`;
}

/** @param {{fixtures: Fixture[]}} input */
export function galleryBody(input) {
  return `
<header class="page-head">
  <h1>Gallery</h1>
  <p class="lede">The 30 examples of the spec, ported from the documentation of Observable Plot: one for each family of marks, and every family of transforms. Each is a <code>plot</code> block that plotdown.js draws in your browser. They are the test fixtures of the renderer: each draws the same SVG as the hand-written <code>Plot.plot()</code> call.</p>
</header>
<div class="specimens all">
${input.fixtures.map((fixture) => specimen(fixture, {heading: "h2"})).join("\n")}
</div>
`;
}

/** @param {{recipes: Map<string, RecipeInfo>}} input */
export function recipesIndexBody(input) {
  return `
<header class="page-head">
  <h1>Recipes</h1>
  <p class="lede">One page for each place that shows Markdown: what to add, where, and how to check that a block became a chart. Recipes we built and checked with the real tool say so at the end; the others say they come from the tool's documentation.</p>
</header>
<div class="recipe-groups">
${GROUPS.map(
  (group) => `<section class="recipe-group" aria-labelledby="group-${group.id}">
  <h2 id="group-${group.id}">${escapeHtml(group.title)}</h2>
  <p>${escapeHtml(group.who)} ${escapeHtml(group.how)}</p>
  <ul>
${group.recipes
  .map((recipe) => {
    const info = input.recipes.get(recipe.slug);
    const status = info?.status === "tried" ? `<span class="status tried">Tried</span>` : info?.status === "docs" ? `<span class="status docs">From the docs</span>` : "";
    return `    <li>${recipeLink(recipe, input.recipes)} <span class="what">${escapeHtml(recipe.what)}</span> ${status}</li>`;
  })
  .join("\n")}
  </ul>
</section>`
).join("\n")}
</div>
`;
}

/**
 * The sidebar of a recipe page.
 * @param {string} current
 * @param {Map<string, RecipeInfo>} recipes
 */
export function recipeNav(current, recipes) {
  return `<nav class="side" aria-label="Recipes">
<p class="side-title"><a href="/recipes/">Recipes</a></p>
${GROUPS.map(
  (group) => `<p class="side-group">${escapeHtml(group.title)}</p>
<ul>
${group.recipes
  .filter((recipe) => recipes.has(recipe.slug))
  .map((recipe) => `<li><a href="/recipes/${recipe.slug}/"${recipe.slug === current ? ' aria-current="page"' : ""}>${escapeHtml(recipe.name)}</a></li>`)
  .join("\n")}
</ul>`
).join("\n")}
</nav>`;
}

/**
 * The table of contents of a long document.
 * @param {{level: number, id: string, text: string}[]} headings
 */
export function toc(headings) {
  const items = headings.filter((heading) => heading.level === 2);
  if (items.length < 3) return "";
  return `<nav class="side toc" aria-label="On this page">
<p class="side-title">On this page</p>
<ul>
${items.map((heading) => `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`).join("\n")}
</ul>
</nav>`;
}

/**
 * @param {{fixtures: Fixture[], starter: string}} input
 */
export function playgroundBody(input) {
  return `
<h1 class="visually-hidden">Playground</h1>
<div class="pg" data-playground>
  <div class="pg-bar" role="toolbar" aria-label="Playground">
    <label class="pg-field">Example
      <select data-example>
        <option value="" disabled>From a link</option>
        <option value="hero">Hours of daylight</option>
${input.fixtures.map((fixture) => `        <option value="${fixture.name}">${escapeHtml(fixture.title)}</option>`).join("\n")}
      </select>
    </label>
    <label class="pg-field">Fence
      <select data-fence>
        <option value="plot">plot</option>
        <option value="oplot">oplot</option>
        <option value="observable-plot">observable-plot</option>
      </select>
    </label>
    <span class="pg-spacer"></span>
    <button type="button" class="button" data-copy-markdown>Copy as Markdown</button>
    <button type="button" class="button" data-copy-link>Copy link</button>
    <label class="pg-field">Image
      <select data-image-format aria-label="What Copy image link copies">
        <option value="markdown">Markdown (SVG)</option>
        <option value="svg">SVG link</option>
        <option value="png">PNG link</option>
      </select>
    </label>
    <button type="button" class="button" data-copy-image title="A link to this chart as an image, drawn by plotdown.cc: for comments, chat and email">Copy image link</button>
    <span class="pg-toast" role="status" aria-live="polite" data-toast></span>
  </div>
  <section class="pg-editor" aria-label="Block">
    <div class="pg-editor-host" data-editor></div>
    <noscript><p class="pg-noscript">The playground needs JavaScript.</p></noscript>
  </section>
  <section class="pg-preview" aria-label="Chart">
    <div class="pg-stage" data-stage>
      <pre class="pg-block"><code class="language-plot" data-block></code></pre>
      <div class="pg-error" data-error hidden role="alert">
        <p class="pg-error-title">This block does not render</p>
        <p class="pg-error-message" data-error-message></p>
        <p class="pg-error-where">At <code data-error-path></code><span data-error-place></span> <button type="button" class="link" data-error-go>Show in the editor</button></p>
      </div>
    </div>
    <p class="pg-status" data-status aria-live="polite"></p>
  </section>
</div>
<script type="application/json" id="starter">${escapeJsonForHtml(JSON.stringify(input.starter))}</script>
`;
}

/** @param {string} json */
function escapeJsonForHtml(json) {
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function notFoundBody() {
  return `
<header class="page-head">
  <h1>Nothing here</h1>
  <p class="lede">This address has no page. Try the <a href="/">home page</a>, the <a href="/recipes/">recipes</a> or the <a href="/playground/">playground</a>.</p>
</header>
`;
}
