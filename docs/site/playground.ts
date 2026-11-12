// The playground: an editor on the left, the chart on the right.
//
// The chart is drawn by plotdown.js itself: the editor's text goes into a
// <pre><code class="language-plot"> block in the preview, which plotdown.js
// watches like any block of a page (data-settle="700" on its script tag). This
// script only reads the state plotdown.js gives the block (data-plotdown:
// pending, rendering, rendered, error) and shows the error, with its JSON path,
// where the chart would be.
//
// The block travels in the URL as #pako:… (see share.ts); ?example=<name> loads
// one of the examples of /examples/.
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands";
import {json} from "@codemirror/lang-json";
import {bracketMatching, foldGutter, HighlightStyle, indentOnInput, syntaxHighlighting} from "@codemirror/language";
import {lintGutter, setDiagnostics, type Diagnostic} from "@codemirror/lint";
import {EditorSelection, EditorState} from "@codemirror/state";
import {drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers} from "@codemirror/view";
import {closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete";
import {highlightSelectionMatches, searchKeymap} from "@codemirror/search";
import {tags} from "@lezer/highlight";
import {DEFAULT_SERVICE_URL, imageLink, LinkTooLongError} from "@devlooped/plotdown/link";
import {findNodeAtLocation, parseTree, type Node as JsonNode} from "jsonc-parser";
import {parsePath} from "./jsonpath.js";
import {decodeSpec, encodeSpec, PREFIX} from "./share.js";

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`playground: ${selector} is missing`);
  return element;
};

const editorHost = $<HTMLElement>("[data-editor]");
const code = $<HTMLElement>("[data-block]");
const block = code.closest("pre") as HTMLPreElement;
const stage = $<HTMLElement>("[data-stage]");
const errorBox = $<HTMLElement>("[data-error]");
const errorMessage = $<HTMLElement>("[data-error-message]");
const errorPath = $<HTMLElement>("[data-error-path]");
const errorPlace = $<HTMLElement>("[data-error-place]");
const errorGo = $<HTMLButtonElement>("[data-error-go]");
const status = $<HTMLElement>("[data-status]");
const exampleSelect = $<HTMLSelectElement>("[data-example]");
const fenceSelect = $<HTMLSelectElement>("[data-fence]");
const toast = $<HTMLElement>("[data-toast]");
const starter = JSON.parse(document.getElementById("starter")?.textContent ?? '""') as string;

// ------------------------------------------------------------------ editor

const highlight = HighlightStyle.define([
  {tag: tags.propertyName, color: "var(--syn-key)"},
  {tag: tags.string, color: "var(--syn-string)"},
  {tag: tags.number, color: "var(--syn-number)"},
  {tag: [tags.bool, tags.null], color: "var(--syn-keyword)"},
  {tag: [tags.brace, tags.squareBracket, tags.separator, tags.punctuation], color: "var(--muted)"},
  {tag: tags.invalid, color: "var(--danger)"}
]);

const theme = EditorView.theme({
  "&": {height: "100%", color: "var(--ink)", backgroundColor: "transparent"},
  ".cm-scroller": {fontFamily: "var(--mono)", fontVariationSettings: '"MONO" 1', lineHeight: "1.55"},
  ".cm-content": {caretColor: "var(--ink)", padding: "12px 0"},
  ".cm-gutters": {backgroundColor: "transparent", color: "var(--muted)", border: "none"},
  ".cm-activeLine": {backgroundColor: "var(--active-line)"},
  ".cm-activeLineGutter": {backgroundColor: "var(--active-line)", color: "var(--ink)"},
  "&.cm-focused": {outline: "none"},
  "&.cm-focused .cm-cursor": {borderLeftColor: "var(--ink)"},
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {backgroundColor: "var(--selection) !important"},
  ".cm-matchingBracket": {backgroundColor: "var(--selection)", outline: "1px solid var(--rule)"},
  ".cm-lintRange-error": {backgroundImage: "none", textDecoration: "underline wavy var(--danger)", textUnderlineOffset: "3px"},
  ".cm-tooltip": {backgroundColor: "var(--surface)", color: "var(--ink)", border: "1px solid var(--rule)"},
  ".cm-diagnostic-error": {borderLeftColor: "var(--danger)"}
});

let applyingExternal = false;

const view = new EditorView({
  parent: editorHost,
  state: EditorState.create({
    doc: "",
    extensions: [
      lineNumbers(),
      foldGutter(),
      lintGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSelectionMatches(),
      json(),
      syntaxHighlighting(highlight),
      EditorView.lineWrapping,
      EditorState.tabSize.of(2),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
      theme,
      EditorView.contentAttributes.of({"aria-label": "The plot block, as JSON"}),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternal) onEdit();
      })
    ]
  })
});

function text(): string {
  return view.state.doc.toString();
}

function setText(value: string): void {
  applyingExternal = true;
  view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: value}, selection: EditorSelection.cursor(0)});
  applyingExternal = false;
  pushToBlock(true);
}

// ------------------------------------------------------------------ block

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let urlTimer: ReturnType<typeof setTimeout> | undefined;

/** Hands the text to plotdown.js, through the block it watches. */
function pushToBlock(now = false): void {
  clearTimeout(pushTimer);
  const go = () => {
    if (code.textContent !== text()) code.textContent = text();
  };
  if (now) go();
  else pushTimer = setTimeout(go, 150);
}

function onEdit(): void {
  pushToBlock();
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => void updateUrl(), 400);
}

async function updateUrl(): Promise<string> {
  const token = await encodeSpec(text());
  const url = `${location.pathname}#${token}`;
  if (`${location.pathname}${location.search}${location.hash}` !== url) window.history.replaceState(null, "", url);
  return `${location.origin}${url}`;
}

// ------------------------------------------------------------------ state

let lastRange: {from: number; to: number} | undefined;

function onState(): void {
  const state = block.getAttribute("data-plotdown");
  if (state === "rendered") {
    showError(undefined);
    status.textContent = describeChart();
  } else if (state === "error") {
    const host = block.nextElementSibling;
    if (host?.localName === "plotdown-error") showError(readError(host as HTMLElement));
  } else if (state === "pending") {
    if (!text().trim()) {
      showError(undefined);
      status.textContent = "Write a block on the left, or pick an example.";
    } else if (errorBox.hidden) {
      status.textContent = "Waiting for complete JSON…";
    }
  }
}

function describeChart(): string {
  try {
    const marks = (JSON.parse(text()) as {marks?: unknown[]}).marks?.length ?? 0;
    return `${marks} ${marks === 1 ? "mark" : "marks"}, drawn by plotdown.js as you type.`;
  } catch {
    return "Drawn by plotdown.js as you type.";
  }
}

interface ShownError {
  message: string;
  path: string;
  line?: number;
  column?: number;
}

/** What plotdown.js wrote in its error box (an open shadow root): the reason, the path, the place. */
function readError(host: HTMLElement): ShownError {
  const box = host.shadowRoot?.querySelector(".error");
  const all = box?.textContent ?? host.title;
  const path = box?.querySelector("code")?.textContent ?? "$";
  const place = /\(line (\d+)(?:, column (\d+))?\)\s*$/.exec(all);
  const error: ShownError = {message: host.title || all, path};
  if (place) {
    error.line = Number(place[1]);
    if (place[2]) error.column = Number(place[2]);
  }
  return error;
}

function showError(error: ShownError | undefined): void {
  if (!error) {
    errorBox.hidden = true;
    stage.classList.remove("failed");
    lastRange = undefined;
    view.dispatch(setDiagnostics(view.state, []));
    return;
  }
  errorMessage.textContent = sentence(error.message);
  errorPath.textContent = error.path;
  errorPlace.textContent = error.line !== undefined ? `, line ${error.line}${error.column !== undefined ? `, column ${error.column}` : ""}` : "";
  errorBox.hidden = false;
  stage.classList.add("failed");
  status.textContent = "The chart comes back as soon as the block is valid.";
  lastRange = locate(error);
  const diagnostics: Diagnostic[] = lastRange ? [{from: lastRange.from, to: lastRange.to, severity: "error", message: `${error.path}: ${error.message}`}] : [];
  view.dispatch(setDiagnostics(view.state, diagnostics));
}

function sentence(message: string): string {
  const trimmed = message.trim();
  return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) + (/[.!?]$/.test(trimmed) ? "" : ".") : "";
}

/** The range of the editor that an error points to: its line and column, or the value at its JSON path. */
function locate(error: ShownError): {from: number; to: number} | undefined {
  const doc = view.state.doc;
  if (error.line !== undefined && error.line >= 1 && error.line <= doc.lines) {
    const line = doc.line(error.line);
    const from = Math.min(line.to, line.from + Math.max(0, (error.column ?? 1) - 1));
    return {from, to: from < line.to ? from + 1 : from};
  }
  const path = parsePath(error.path);
  const tree = parseTree(text());
  if (!path || !tree) return undefined;
  for (let length = path.length; length >= 0; length--) {
    const node = findNodeAtLocation(tree, path.slice(0, length));
    if (node) return rangeOf(node);
  }
  return undefined;
}

function rangeOf(node: JsonNode): {from: number; to: number} {
  const property = node.parent?.type === "property" ? node.parent : undefined;
  const key = property?.children?.[0];
  if (key && key !== node) {
    const container = node.type === "object" || node.type === "array";
    return {from: key.offset, to: container ? key.offset + key.length : node.offset + node.length};
  }
  if (node.type === "object" || node.type === "array") return {from: node.offset, to: node.offset + 1};
  return {from: node.offset, to: node.offset + node.length};
}

errorGo.addEventListener("click", () => {
  if (!lastRange) return;
  view.dispatch({selection: EditorSelection.range(lastRange.from, lastRange.to), scrollIntoView: true});
  view.focus();
});

new MutationObserver(onState).observe(block, {attributes: true, attributeFilter: ["data-plotdown"]});

// ------------------------------------------------------------------ examples, URL, copy

async function loadExample(name: string): Promise<void> {
  if (name === "hero") {
    setText(starter);
  } else {
    if (!/^[\w-]+$/.test(name)) return;
    const response = await fetch(`/examples/${name}.json`);
    if (!response.ok) {
      say(`There is no example named ${name}.`);
      return;
    }
    setText((await response.text()).replace(/\r\n?/g, "\n").trimEnd());
  }
  exampleSelect.value = name;
  window.history.replaceState(null, "", `${location.pathname}?example=${encodeURIComponent(name)}`);
}

exampleSelect.addEventListener("change", () => void loadExample(exampleSelect.value));

function markdown(): string {
  return "```" + fenceSelect.value + "\n" + text().trimEnd() + "\n```\n";
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function say(message: string): void {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.textContent = ""), 2400);
}

async function copy(value: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    say(done);
  } catch {
    say("The browser did not allow copying.");
  }
}

$<HTMLButtonElement>("[data-copy-markdown]").addEventListener("click", () => void copy(markdown(), "Copied the block as Markdown."));
$<HTMLButtonElement>("[data-copy-link]").addEventListener("click", async () => copy(await updateUrl(), "Copied a link to this block."));

// The image link: the same block, drawn by the image service of this site
// (https://plotdown.cc/svg/pako:… or /png/…), for places that show images only.
const imageFormat = $<HTMLSelectElement>("[data-image-format]");
function copyImageLink(): Promise<void> {
  if (block.dataset.plotdown === "error") {
    say("Fix the block first: the image service refuses an invalid block.");
    return Promise.resolve();
  }
  const baseUrl = location.protocol === "https:" ? location.origin : DEFAULT_SERVICE_URL;
  try {
    const kind = imageFormat.value;
    const link = imageLink(text(), {format: kind === "png" ? "png" : "svg", baseUrl, ...(kind === "png" ? {scale: 2} : {})});
    if (kind !== "markdown") return copy(link, `Copied the ${kind.toUpperCase()} link.`);
    let alt = "Chart";
    try {
      const title = (JSON.parse(text()) as {title?: unknown}).title;
      if (typeof title === "string" && title.trim()) alt = title.trim();
    } catch {
      // not JSON yet: the plain alternative text stays
    }
    return copy(`![${alt.replace(/[\[\]\\]/g, (c) => `\\${c}`)}](${link})`, "Copied the image as Markdown.");
  } catch (error) {
    say(error instanceof LinkTooLongError ? "This block is too long for a link: commit an SVG with the CLI instead." : String(error));
    return Promise.resolve();
  }
}
$<HTMLButtonElement>("[data-copy-image]").addEventListener("click", () => void copyImageLink());

async function start(): Promise<void> {
  const hash = location.hash.slice(1);
  const example = new URLSearchParams(location.search).get("example");
  if (hash.startsWith(PREFIX)) {
    try {
      setText(await decodeSpec(hash));
      exampleSelect.value = "";
      return;
    } catch {
      say("The link holds no block that can be read; showing an example instead.");
    }
  }
  if (example) await loadExample(example);
  else setText(starter);
}

addEventListener("hashchange", () => {
  if (location.hash.startsWith(`#${PREFIX}`)) {
    void decodeSpec(location.hash.slice(1)).then((value) => {
      if (value !== text()) setText(value);
    }, () => undefined);
  }
});

void start().then(onState);
