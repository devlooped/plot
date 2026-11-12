// @ts-check
// The Markdown of the site (the spec, the recipes): markdown-it with plotdown's
// own plugin in client mode (plot blocks stay blocks, and plotdown.js draws
// them in the page), Shiki for the other code blocks, GitHub alerts, heading
// ids, and links rewritten from repository paths to site paths.
import MarkdownIt from "markdown-it";
import plotdown from "@devlooped/plotdown/markdown-it";
import {createHighlighter} from "shiki";

const THEMES = {light: "github-light", dark: "github-dark"};
const LANGS = ["json", "jsonc", "js", "ts", "jsx", "tsx", "html", "css", "toml", "yaml", "lua", "sh", "shellsession", "powershell", "markdown", "liquid", "diff", "python", "ruby", "go", "vue", "astro", "mdx", "xml"];
/** Fence names Shiki does not know, and what to highlight them as. */
const ALIASES = {
  "go-html-template": "html",
  "gotmpl": "html",
  "hugo": "html",
  "console": "shellsession",
  "bash": "sh",
  "shell": "sh",
  "yml": "yaml",
  "javascript": "js",
  "typescript": "ts",
  "mjs": "js",
  "md": "markdown",
  "ps1": "powershell",
  "pwsh": "powershell",
  "jsonl": "json",
  "gfm": "markdown"
};

const ALERTS = {NOTE: "Note", TIP: "Tip", IMPORTANT: "Important", WARNING: "Warning", CAUTION: "Caution"};

/**
 * @typedef {object} MarkdownEnv
 * @property {string} source The repository path of the Markdown file, with forward slashes.
 * @property {{level: number, id: string, text: string}[]} [headings] Filled while rendering.
 */

/**
 * @param {{resolveLink: (href: string, source: string) => string}} options
 */
export async function createMarkdown({resolveLink}) {
  const highlighter = await createHighlighter({themes: [THEMES.light, THEMES.dark], langs: LANGS});
  const known = new Set(highlighter.getLoadedLanguages());

  const md = new MarkdownIt({
    html: true,
    linkify: false,
    typographer: false,
    highlight(code, lang) {
      const name = /** @type {Record<string, string>} */ (ALIASES)[lang] ?? lang;
      if (!name || !known.has(name)) return "";
      const html = highlighter.codeToHtml(code.replace(/\n$/, ""), {lang: name, themes: THEMES, defaultColor: false});
      // In Markdown shown as source, the fence lines take the brand's fence color.
      return name === "markdown" ? html.replace(/<span class="line">(?=(?:<span[^>]*>)*\s*(?:`{3,}|~{3,}))/g, '<span class="line fence">') : html;
    }
  });
  // plot, oplot and observable-plot fences become <pre class="plotdown"><code class="language-plot">.
  md.use(plotdown, {mode: "client"});

  // Plain code blocks (no language, or one Shiki does not know) get the same frame as highlighted ones.
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const html = /** @type {NonNullable<typeof fence>} */ (fence)(tokens, idx, options, env, self);
    return html.startsWith("<pre><code") ? html.replace("<pre>", '<pre class="shiki plain" tabindex="0">') : html;
  };

  // GitHub alerts: > [!NOTE], > [!WARNING]…
  md.core.ruler.after("block", "plotdown-site-alerts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]?.type !== "blockquote_open") continue;
      const inline = tokens[i + 2];
      if (tokens[i + 1]?.type !== "paragraph_open" || inline?.type !== "inline") continue;
      const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/.exec(inline.content);
      if (!match) continue;
      const kind = /** @type {keyof typeof ALERTS} */ (match[1]);
      tokens[i]?.attrJoin("class", `alert alert-${kind.toLowerCase()}`);
      inline.content = inline.content.slice(match[0].length);
      const title = new state.Token("html_block", "", 0);
      title.content = `<p class="alert-title">${ALERTS[kind]}</p>\n`;
      tokens.splice(i + 1, 0, title);
      // An alert whose first paragraph held only the marker.
      if (!inline.content.trim()) {
        const close = tokens[i + 4];
        if (close?.type === "paragraph_close") tokens.splice(i + 2, 3);
      }
    }
  });

  // Heading ids (GitHub's slugs) and the list of headings; links and images rewritten.
  md.core.ruler.push("plotdown-site-headings-links", (state) => {
    const env = /** @type {MarkdownEnv} */ (state.env);
    const used = new Map();
    env.headings = [];
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;
      if (token.type === "heading_open") {
        const inline = tokens[i + 1];
        const text = (inline?.children ?? []).filter((child) => child.type === "text" || child.type === "code_inline").map((child) => child.content).join("");
        let id = slug(text);
        const count = used.get(id) ?? 0;
        used.set(id, count + 1);
        if (count) id = `${id}-${count}`;
        token.attrSet("id", id);
        env.headings.push({level: Number(token.tag.slice(1)), id, text});
      }
      if (token.type === "inline") {
        for (const child of token.children ?? []) {
          if (child.type === "link_open") {
            const href = child.attrGet("href");
            if (href) child.attrSet("href", resolveLink(String(href), env.source));
          } else if (child.type === "image") {
            const src = child.attrGet("src");
            if (src) child.attrSet("src", resolveLink(String(src), env.source));
          }
        }
      }
    }
  });

  // Tables scroll on their own on narrow screens.
  md.renderer.rules.table_open = () => '<div class="table"><table>\n';
  md.renderer.rules.table_close = () => "</table></div>\n";

  return {
    /**
     * @param {string} text
     * @param {MarkdownEnv} env
     */
    render(text, env) {
      return md.render(text.replace(/\r\n?/g, "\n"), env);
    },
    /**
     * Highlights one block of code, as in a Markdown fence.
     * @param {string} code
     * @param {string} lang
     */
    highlight(code, lang) {
      return md.render("````" + lang + "\n" + code.replace(/\r\n?/g, "\n").replace(/\n?$/, "\n") + "````\n", {source: ""});
    },
    /** @param {string} text */
    inline(text) {
      return md.renderInline(text, {source: ""});
    }
  };
}

/**
 * GitHub's heading slug: lower case, punctuation dropped, spaces to dashes.
 * @param {string} text
 */
export function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}
