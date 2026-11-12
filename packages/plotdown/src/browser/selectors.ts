// Where plot blocks are in a rendered page: one table of selectors, one entry
// per kind of markup. A later entry for a new host is a few lines and a saved
// HTML sample under test/browser/samples. A selector that no longer matches
// means "not rendered", never a broken page.
//
// Read from the live sites on 2026-11-12: none of GitHub, GitLab, Gitea,
// Forgejo, Bitbucket, Azure DevOps, ChatGPT, Claude or Gemini draws its
// Markdown inside a shadow root, so one observer on the document sees every
// block. A host that does needs BlockRenderer.observe(shadowRoot) and a scan of
// it, for each such root (an extension would watch for them being attached).
import {isPlotFence} from "../fences.js";

/** One kind of markup that holds a plot block. */
export interface BlockSelector {
  /** A short name, for tests and diagnostics: "markdown", "github", "gitlab"… */
  name: string;
  /** A CSS selector of the element that marks a candidate block. */
  selector: string;
  /**
   * The fence name the element carries, checked with isPlotFence. Leave it out
   * when the selector already names the fence.
   */
  fence?: (element: Element) => string | null | undefined;
  /**
   * The markup is shared with another language (GitHub writes a gnuplot script
   * and a plot block alike): render only text that is a plot spec, and never
   * show an error for anything else.
   */
  ambiguous?: boolean;
  /** The element that stands for the whole block, hidden once the chart shows. Default: the matched element. */
  block?: (element: Element) => Element | null | undefined;
  /** The source text of the block. Default: the text of the matched element. */
  text?: (element: Element) => string | null | undefined;
}

const PLOT_LANGS = ["plot", "oplot", "observable-plot"];
const langClasses = (prefix: string, tag = "") => PLOT_LANGS.map((name) => `${tag}.${prefix}${name}`);
const closestPre = (element: Element) => element.closest("pre") ?? element;
const innerText = (element: Element) => (element.querySelector("code") ?? element.querySelector("pre") ?? element).textContent;

/** The fence name in a class list such as "hljs language-plot" or "lang-oplot". */
function fenceFromClass(element: Element): string | null {
  for (const name of Array.from(element.classList)) {
    const match = /^(?:language|lang)-(.+)$/.exec(name);
    if (match && isPlotFence(match[1])) return match[1]!;
  }
  return null;
}

/**
 * The selectors, in order: the first entry that claims a block wins, and a block
 * inside or around one already claimed is skipped, so overlapping entries never
 * render a block twice.
 */
export const SELECTORS: readonly BlockSelector[] = [
  // Sites whose block has a header (language label, copy button) around the
  // <pre>: these come first, so that the header hides with the code.
  {
    // ChatGPT (chatgpt.com, 2026-11-12): <div><div><span>plot</span></div>
    // <pre><code data-code-language="plot">…</code></pre></div>; the copy button
    // joins the wrapper once the answer ends. Not in a shadow root.
    name: "chatgpt",
    selector: "pre > code[data-code-language]",
    fence: (element) => element.getAttribute("data-code-language"),
    block: (element) => {
      const pre = closestPre(element);
      // The wrapper starts with the label that names the fence: hide it with the code.
      return pre.previousElementSibling?.textContent?.trim() === element.getAttribute("data-code-language") ? pre.parentElement : pre;
    }
  },
  {
    // Claude (claude.ai, 2026-11-12): <div role="group" aria-label="sql code">
    // <div>copy</div><div>sql</div><div class="overflow-x-auto"><pre
    // class="code-block__code"><code class="language-sql">. Claude reads the
    // fence name with /language-(\w+)/: `observable-plot` arrives as `observable`.
    name: "claude",
    selector: 'div[role="group"][aria-label$=" code"] pre.code-block__code',
    fence: (element) => element.closest('[role="group"]')?.getAttribute("aria-label")?.replace(/ code$/, ""),
    block: (element) => element.closest('[role="group"]')
  },
  {
    // Claude's `observable-plot`, named "observable": render only a plot spec.
    name: "claude-observable",
    selector: 'div[role="group"][aria-label="observable code"] pre.code-block__code',
    ambiguous: true,
    block: (element) => element.closest('[role="group"]')
  },
  {
    // Gemini (gemini.google.com, 2026-11-12) drops the fence name: a `plot` block
    // is <code-block>…<span>Code snippet</span>…<pre><code data-test-id="code-content"
    // class="code-container formatted">. Not in a shadow root.
    name: "gemini",
    selector: 'code-block code[data-test-id="code-content"]',
    ambiguous: true,
    block: (element) => element.closest("code-block")
  },
  {
    // Bitbucket Cloud (2026-11-12) drops every fence name, known or not:
    // <div class="codehilite"><pre><span></span>…</pre></div>.
    name: "bitbucket",
    selector: "div.codehilite > pre",
    ambiguous: true,
    block: (element) => element.parentElement
  },
  {
    // Azure DevOps (a public repo README, 2026-11-12) keeps a known language as a
    // bare class (<code class="yaml">) and drops an unknown one:
    // <div class="copy-btn-container"><button>…</button><pre class="hljs"><code>.
    name: "azure-devops",
    selector: ['.markdown-content pre.hljs > code:not([class])', '.markdown-content pre.hljs > code[class=""]'].join(", "),
    ambiguous: true,
    block: (element) => element.closest(".copy-btn-container") ?? closestPre(element)
  },
  {
    // Gitea (gitea.com, 2026-11-12): <div class="code-block-container"><pre
    // class="code-block"><code class="chroma language-plot">. Gitea turns every
    // character but [a-z0-9_] into "_" in that class: observable-plot is
    // language-observable_plot (modules/highlight/highlight.go). Forgejo
    // (Codeberg) keeps the name: the "markdown" entry finds it.
    name: "gitea",
    selector: "div.code-block-container > pre.code-block > code",
    fence: (element) => (element.classList.contains("language-observable_plot") ? "observable-plot" : fenceFromClass(element)),
    block: (element) => element.parentElement!.parentElement
  },
  {
    // markdown-it, marked, remark/rehype, Hugo, Jekyll (kramdown with Rouge
    // off), highlight.js and Prism: <pre><code class="language-plot">.
    name: "markdown",
    selector: langClasses("language-", "pre > code").join(", "),
    block: closestPre
  },
  {
    // Pandoc and Python-Markdown write the fence name as a class of <pre>.
    name: "pre-class",
    selector: langClasses("", "pre").join(", ")
  },
  {
    // GitHub writes <pre lang="oplot"> for a fence it does not highlight; so do
    // a few parsers. The live site wraps it in a copy-button container.
    name: "pre-lang",
    selector: "pre[lang]",
    fence: (element) => element.getAttribute("lang"),
    block: (element) => (element.parentElement?.matches(".snippet-clipboard-content") ? element.parentElement : element)
  },
  {
    // GitHub highlights a `plot` fence as gnuplot (Linguist maps .plot to
    // Gnuplot): <div class="highlight highlight-source-gnuplot"><pre>…</pre></div>.
    // A real gnuplot script looks the same, so only a plot spec renders.
    name: "github",
    selector: "div.highlight-source-gnuplot",
    ambiguous: true,
    text: (element) => (element.querySelector("pre") ?? element).textContent
  },
  {
    // GitLab (Banzai SyntaxHighlightFilter): Rouge has no lexer for `plot`, so
    // <div class="markdown-code-block"><pre data-canonical-lang="plot"
    // class="… language-plaintext"><code><span class="line">…</span>…</code></pre>
    // <copy-code></copy-code></div>.
    name: "gitlab",
    selector: "pre[data-canonical-lang]",
    fence: (element) => element.getAttribute("data-canonical-lang"),
    block: (element) => element.closest(".markdown-code-block") ?? element
  },
  {
    // Anything else that names the language in a class or a data attribute:
    // Hugo's data-lang, Prism's lang- prefix, and markup where <code> is not
    // directly in <pre>. Not MkDocs without custom fences: Pygments has no lexer
    // for `plot`, so pymdownx writes <div class="highlight"> (or
    // "language-text highlight") and the fence name is gone; its SuperFences
    // custom fences write <pre class="plot">, which "pre-class" finds.
    name: "fallback",
    selector: [
      ...PLOT_LANGS.flatMap((name) => [`[class*="language-${name}"]`, `[class*="lang-${name}"]`]),
      ...["pre", "code", "div"].flatMap((tag) => [`${tag}[data-lang]`, `${tag}[data-language]`])
    ].join(", "),
    fence: (element) => fenceFromClass(element) ?? element.getAttribute("data-lang") ?? element.getAttribute("data-language"),
    block: (element) => (element.localName === "code" ? closestPre(element) : element),
    text: innerText
  }
];

/** A block found in a page. */
export interface FoundBlock {
  /** The element that stands for the block: hidden when the chart shows, marked with data-plotdown. */
  block: Element;
  /** The element the selector matched, which the text is read from. */
  element: Element;
  /** The source text. */
  text: string;
  /** The selector entry that found it. */
  selector: BlockSelector;
}

/** Elements of an editor: a block there is being written, not read. */
const EDITABLE = '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/** Reads a matched element through its selector entry; null when it is not a plot block. Never throws. */
export function readBlock(element: Element, selector: BlockSelector): FoundBlock | null {
  try {
    if (selector.fence && !isPlotFence(selector.fence(element))) return null;
    const block = selector.block ? selector.block(element) : element;
    if (!block || block.closest(EDITABLE)) return null;
    const text = selector.text ? selector.text(element) : element.textContent;
    return {block, element, text: text ?? "", selector};
  } catch {
    return null;
  }
}

/** All matches of the selectors in and under root, in table order. A broken entry is skipped. */
export function matchSelectors(root: ParentNode, selectors: readonly BlockSelector[] = SELECTORS): FoundBlock[] {
  const found: FoundBlock[] = [];
  const seen = new Set<Element>();
  for (const selector of selectors) {
    let elements: Element[];
    try {
      elements = Array.from(root.querySelectorAll(selector.selector));
      if (isElement(root) && root.matches(selector.selector)) elements.unshift(root);
    } catch {
      continue;
    }
    for (const element of elements) {
      const result = readBlock(element, selector);
      if (!result || seen.has(result.block)) continue;
      seen.add(result.block);
      found.push(result);
    }
  }
  return found;
}

/**
 * The candidate plot blocks in and under root, each once: of two nested
 * candidates, the one an earlier entry found wins. Whether a candidate's text
 * is a complete plot spec is for the caller to decide (an ambiguous entry may
 * well be gnuplot, any entry may be still streaming).
 */
export function findBlocks(root: ParentNode, selectors: readonly BlockSelector[] = SELECTORS): FoundBlock[] {
  const kept: FoundBlock[] = [];
  for (const candidate of matchSelectors(root, selectors)) {
    if (kept.some((other) => other.block.contains(candidate.block) || candidate.block.contains(other.block))) continue;
    kept.push(candidate);
  }
  return kept;
}

function isElement(node: ParentNode): node is Element {
  return (node as Node).nodeType === 1;
}
