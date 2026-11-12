// Finds the plot blocks of a page, renders them, and keeps watching the page.
import {PlotdownError} from "../errors.js";
import {isPlotSpec} from "../fences.js";
import {parse} from "../parse.js";
import {renderAsync} from "../render.js";
import type {FetchOptions, PlotdownOptions} from "../types.js";
import {findBlocks, readBlock, SELECTORS, type BlockSelector, type FoundBlock} from "./selectors.js";
import {adoptStyles, HOST_CSS, takeStyles} from "./styles.js";
import {detectTheme, type ThemeOption} from "./theme.js";

/** Options of the browser renderer. Remote data stays off unless allowRemote says otherwise. */
export interface BrowserOptions extends PlotdownOptions {
  /** "auto" (the default) follows the page; "light" or "dark" forces one. */
  theme?: ThemeOption;
  /** A button that switches between the chart and its source (default true). */
  toggle?: boolean;
  /**
   * While the page is watched, how long (ms) a block that starts like JSON but
   * does not parse must stay unchanged before its syntax error shows, so that a
   * block still streaming shows no error. false never shows it. Default 3000.
   */
  settle?: number | false;
  /** The selector table (default SELECTORS). */
  selectors?: readonly BlockSelector[];
  /** The fetch function for remote data, when allowRemote permits it. */
  fetch?: FetchOptions["fetch"];
}

/** What a scan found: counts of the blocks in each state when it ended. */
export interface ScanResult {
  rendered: number;
  failed: number;
  pending: number;
}

/** The attribute that marks a claimed block, on the block element: pending, rendering, rendered or error. */
export const STATE_ATTRIBUTE = "data-plotdown";
/** The tag of the element that holds a chart, inserted before its block. */
export const CHART_TAG = "plotdown-chart";
/** The tag of the element that holds an error, inserted after its block. */
export const ERROR_TAG = "plotdown-error";

type State = "pending" | "rendering" | "rendered" | "error";

interface Entry {
  block: HTMLElement;
  element: Element;
  selector: BlockSelector;
  state: State;
  text: string;
  /** Bumped on each change of text, so that a render that finishes late is dropped. */
  version: number;
  chart?: HTMLElement;
  error?: HTMLElement;
  timer?: ReturnType<typeof setTimeout>;
  display?: {value: string; priority: string};
  /** How many times the chart was put back after the page removed it. */
  restored: number;
}

const FLUSH_DELAY = 50;
const MAX_RESTORE = 3;
const OBSERVED_ATTRIBUTES = ["class", "lang", "data-lang", "data-language", "data-canonical-lang"];
const THEME_ATTRIBUTES = ["class", "style", "data-color-mode", "data-theme", "data-dark-theme", "data-light-theme", "data-color-scheme", "data-mode"];

/**
 * Renders the plot blocks under a root and, once observing, those that the
 * page adds or completes later. Each block is claimed once, with an attribute
 * that other instances (another copy of the script, an extension's content
 * script) respect, so no block renders twice.
 */
export class BlockRenderer {
  options: BrowserOptions;
  private readonly entries = new Map<Element, Entry>();
  private observer: MutationObserver | undefined;
  private themeObserver: MutationObserver | undefined;
  private media: MediaQueryList | undefined;
  /** Nodes whose content changed: they may complete a known block. */
  private readonly changed = new Set<Node>();
  /** Elements added or whose language attributes changed: they may hold new blocks. */
  private readonly added = new Set<Element>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private themeTimer: ReturnType<typeof setTimeout> | undefined;
  private removals = false;
  private readonly onSchemeChange = () => this.scheduleTheme();

  constructor(options: BrowserOptions = {}) {
    this.options = {...options};
  }

  /**
   * Renders the blocks under root now. With final, the text of each block is
   * taken as complete: a block that does not parse shows its error at once.
   * Without it, such a block waits for more text (see settle).
   */
  async scan(root: ParentNode, final = false): Promise<ScanResult> {
    const found = findBlocks(root, this.selectors);
    await Promise.all(found.map((block) => this.consider(block, final)));
    const result: ScanResult = {rendered: 0, failed: 0, pending: 0};
    for (const {block} of found) {
      const entry = this.entries.get(block);
      // Without an observer nothing will complete a waiting block: let it go, so another instance may take it.
      if (entry?.state === "pending" && !this.observer) this.release(entry);
      const state = entry?.state;
      if (state === "rendered") result.rendered++;
      else if (state === "error") result.failed++;
      else if (state === "pending" || state === "rendering") result.pending++;
    }
    return result;
  }

  /** Watches root for blocks that are added, changed or completed. */
  observe(root: Node): void {
    const document = root.ownerDocument ?? (root as Document);
    const view = document.defaultView;
    if (!view?.MutationObserver) return;
    this.observer ??= new view.MutationObserver((records) => this.onMutations(records));
    this.observer.observe(root, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: OBSERVED_ATTRIBUTES});
    if (!this.themeObserver && (this.options.theme ?? "auto") === "auto") {
      this.themeObserver = new view.MutationObserver(() => this.scheduleTheme());
      for (const element of [document.documentElement, document.body]) {
        if (element) this.themeObserver.observe(element, {attributes: true, attributeFilter: THEME_ATTRIBUTES});
      }
      this.media = view.matchMedia?.("(prefers-color-scheme: dark)");
      this.media?.addEventListener?.("change", this.onSchemeChange);
    }
  }

  /** Stops watching. Charts stay; blocks still waiting for text are released. */
  disconnect(): void {
    this.observer?.disconnect();
    this.themeObserver?.disconnect();
    this.media?.removeEventListener?.("change", this.onSchemeChange);
    this.observer = this.themeObserver = this.media = undefined;
    clearTimeout(this.flushTimer);
    clearTimeout(this.themeTimer);
    this.flushTimer = this.themeTimer = undefined;
    this.changed.clear();
    this.added.clear();
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer);
      if (entry.state === "pending") this.release(entry);
    }
  }

  /** Applies the page's current theme to every chart again. */
  retheme(): void {
    for (const entry of this.entries.values()) {
      for (const host of [entry.chart, entry.error]) if (host) this.applyTheme(host, entry.block);
    }
  }

  private get selectors(): readonly BlockSelector[] {
    return this.options.selectors ?? SELECTORS;
  }

  private async consider(found: FoundBlock, final: boolean): Promise<void> {
    const existing = this.entries.get(found.block);
    if (existing) return this.update(existing, found.text, final);
    const block = found.block as HTMLElement;
    // Claimed by another instance, or inside or around a claimed block.
    if (block.hasAttribute(STATE_ATTRIBUTE) || block.parentElement?.closest(`[${STATE_ATTRIBUTE}]`) || block.querySelector(`[${STATE_ATTRIBUTE}]`)) return;
    // Ambiguous markup that is not even JSON is the other language: leave it alone.
    if (found.selector.ambiguous && !found.text.trimStart().startsWith("{")) return;
    const entry: Entry = {block, element: found.element, selector: found.selector, state: "pending", text: "", version: 0, restored: 0};
    this.entries.set(block, entry);
    this.setState(entry, "pending");
    return this.update(entry, found.text, final);
  }

  private async update(entry: Entry, text: string, final: boolean): Promise<void> {
    if (text === entry.text && entry.state !== "pending") return;
    if (text === entry.text && entry.state === "pending" && entry.version > 0 && !final) return;
    entry.text = text;
    const version = ++entry.version;
    clearTimeout(entry.timer);
    entry.timer = undefined;

    if (entry.selector.ambiguous ? isPlotSpec(text) : isJsonObject(text)) return this.draw(entry, version);

    // Not complete (or not a plot block at all): it stays code.
    this.clearError(entry);
    if (entry.state !== "rendered") this.setState(entry, "pending");
    if (entry.selector.ambiguous || !text.trimStart().startsWith("{")) return;
    if (final) return this.fail(entry, syntaxError(text));
    const settle = this.options.settle ?? 3000;
    if (settle !== false && this.observer) {
      entry.timer = setTimeout(() => {
        if (entry.version === version && this.entries.get(entry.block) === entry) this.fail(entry, syntaxError(text));
      }, settle);
    }
  }

  private async draw(entry: Entry, version: number): Promise<void> {
    if (entry.state !== "rendered") this.setState(entry, "rendering");
    const document = entry.block.ownerDocument;
    let figure: Element;
    try {
      const {theme: _theme, toggle: _toggle, settle: _settle, selectors: _selectors, ...core} = this.options;
      figure = await renderAsync(entry.text, {...core, baseUrl: core.baseUrl ?? document.baseURI, document});
    } catch (error) {
      if (entry.version === version && this.entries.get(entry.block) === entry) this.fail(entry, error);
      return;
    }
    if (entry.version !== version || this.entries.get(entry.block) !== entry) return;
    this.mount(entry, figure);
  }

  private mount(entry: Entry, figure: Element): void {
    const document = entry.block.ownerDocument;
    const host = document.createElement(CHART_TAG);
    const shadow = host.attachShadow({mode: "open"});
    adoptStyles(shadow, [HOST_CSS, ...takeStyles(figure)]);
    const chart = document.createElement("div");
    chart.className = "chart";
    chart.append(figure);
    if (this.options.toggle ?? true) {
      const toolbar = document.createElement("div");
      toolbar.className = "toolbar";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Source";
      button.title = "Show the source of this chart";
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const showSource = !chart.hidden;
        chart.hidden = showSource;
        if (showSource) this.show(entry);
        else this.hide(entry);
        button.textContent = showSource ? "Chart" : "Source";
        button.title = showSource ? "Show the chart" : "Show the source of this chart";
        button.setAttribute("aria-pressed", String(showSource));
      });
      toolbar.append(button);
      shadow.append(toolbar);
    }
    shadow.append(chart);
    this.applyTheme(host, entry.block);
    this.clearError(entry);
    entry.chart?.remove();
    entry.block.before(host);
    entry.chart = host;
    this.hide(entry);
    this.setState(entry, "rendered");
  }

  private fail(entry: Entry, error: unknown): void {
    const document = entry.block.ownerDocument;
    entry.chart?.remove();
    entry.chart = undefined;
    this.show(entry);
    this.clearError(entry);
    const host = document.createElement(ERROR_TAG);
    const shadow = host.attachShadow({mode: "open"});
    adoptStyles(shadow, [HOST_CSS]);
    const box = document.createElement("div");
    box.className = "error";
    box.setAttribute("role", "note");
    const title = document.createElement("strong");
    title.textContent = "plotdown: ";
    box.append(title, describe(error));
    if (error instanceof PlotdownError) {
      const at = document.createElement("code");
      at.textContent = error.path;
      box.append(" at ", at);
      if (error.line !== undefined) box.append(` (line ${error.line}${error.column !== undefined ? `, column ${error.column}` : ""})`);
    }
    shadow.append(box);
    host.title = describe(error);
    this.applyTheme(host, entry.block);
    entry.block.after(host);
    entry.error = host;
    this.setState(entry, "error");
  }

  private clearError(entry: Entry): void {
    entry.error?.remove();
    entry.error = undefined;
  }

  private hide(entry: Entry): void {
    const style = entry.block.style;
    entry.display ??= {value: style.getPropertyValue("display"), priority: style.getPropertyPriority("display")};
    style.setProperty("display", "none", "important");
  }

  private show(entry: Entry): void {
    if (!entry.display) return;
    const style = entry.block.style;
    if (entry.display.value) style.setProperty("display", entry.display.value, entry.display.priority);
    else style.removeProperty("display");
    entry.display = undefined;
  }

  private setState(entry: Entry, state: State): void {
    entry.state = state;
    entry.block.setAttribute(STATE_ATTRIBUTE, state);
  }

  private release(entry: Entry): void {
    this.entries.delete(entry.block);
    entry.block.removeAttribute(STATE_ATTRIBUTE);
  }

  private applyTheme(host: HTMLElement, block: Element): void {
    const option = this.options.theme ?? "auto";
    const theme = detectTheme(block, option);
    host.setAttribute("data-scheme", theme.scheme);
    host.style.setProperty("color-scheme", theme.scheme);
    host.style.setProperty("--plotdown-background", theme.background);
    if (option === "auto") {
      host.removeAttribute("data-forced");
      host.style.removeProperty("--plotdown-color");
    } else {
      host.setAttribute("data-forced", "");
      host.style.setProperty("--plotdown-color", theme.color ?? "inherit");
    }
  }

  private scheduleTheme(): void {
    clearTimeout(this.themeTimer);
    this.themeTimer = setTimeout(() => this.retheme(), FLUSH_DELAY);
  }

  // Kept cheap for busy pages: records are only sorted here; the work waits for
  // a flush at most every FLUSH_DELAY ms. A change of content is checked against
  // the known blocks only; just added elements (and elements whose language
  // attributes changed) are searched for new blocks.
  private onMutations(records: MutationRecord[]): void {
    for (const record of records) {
      const target = record.target;
      if (isOwnHost(target)) continue;
      if (record.type === "childList") {
        if (record.removedNodes.length) this.removals = true;
        if (this.entries.size) this.changed.add(target);
        for (const node of Array.from(record.addedNodes)) if (node.nodeType === 1 && !isOwnHost(node)) this.added.add(node as Element);
      } else if (record.type === "attributes") {
        this.added.add(target as Element);
      } else if (this.entries.size) {
        this.changed.add(target);
      }
    }
    if (this.changed.size || this.added.size || this.removals) this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_DELAY);
  }

  private flush(): void {
    this.flushTimer = undefined;
    const changed = Array.from(this.changed);
    const added = Array.from(this.added);
    this.changed.clear();
    this.added.clear();
    if (this.removals) {
      this.removals = false;
      this.cleanup();
    }
    const touched = new Set<Entry>();
    for (const node of [...changed, ...added]) {
      if (!node.isConnected) continue;
      for (const entry of this.entries.values()) if (entry.block.contains(node)) touched.add(entry);
    }
    // An element inside another added one is searched with it (checked only for
    // small batches; a big batch searches some subtrees twice, which is harmless).
    const nested = added.length <= 64 ? (element: Element) => added.some((other) => other !== element && other.contains(element)) : () => false;
    for (const element of added) {
      if (!element.isConnected || nested(element)) continue;
      for (const found of safeFind(element, this.selectors)) {
        const entry = this.entries.get(found.block);
        if (entry) touched.add(entry);
        else void this.consider(found, false);
      }
    }
    for (const entry of touched) {
      if (this.entries.get(entry.block) !== entry) continue;
      const found = readBlock(entry.element, entry.selector);
      if (found) void this.update(entry, found.text, false);
    }
  }

  /** Drops the blocks the page removed, and puts back a chart the page removed while its block stayed. */
  private cleanup(): void {
    for (const entry of Array.from(this.entries.values())) {
      if (!entry.block.isConnected) {
        clearTimeout(entry.timer);
        entry.chart?.remove();
        entry.error?.remove();
        this.entries.delete(entry.block);
        continue;
      }
      if (entry.chart && !entry.chart.isConnected && entry.state === "rendered") {
        if (entry.restored++ < MAX_RESTORE) entry.block.before(entry.chart);
        else {
          entry.chart = undefined;
          this.show(entry);
        }
      }
      if (entry.error && !entry.error.isConnected && entry.restored++ < MAX_RESTORE) entry.block.after(entry.error);
    }
  }
}

function safeFind(root: Element, selectors: readonly BlockSelector[]): FoundBlock[] {
  try {
    return findBlocks(root, selectors);
  } catch {
    return [];
  }
}

function isOwnHost(node: Node): boolean {
  const name = (node as Element).localName;
  return name === CHART_TAG || name === ERROR_TAG;
}

/** Whether a text is a whole JSON object: a block still streaming never is (once its last brace closes, it is complete). */
function isJsonObject(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    const value: unknown = JSON.parse(trimmed);
    return typeof value === "object" && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

function syntaxError(text: string): unknown {
  try {
    parse(text);
  } catch (error) {
    return error;
  }
  return new PlotdownError("$", "the block is not a JSON object");
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
