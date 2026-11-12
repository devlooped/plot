// The MCP Apps view: draws the block of a render_plot call with the plotdown
// core (Plot and d3 bundled in), in the host's theme and width, with its source.
import {PlotdownError, render} from "@devlooped/plotdown";
import {App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables, type McpUiHostContext} from "@modelcontextprotocol/ext-apps";
import {toFence, toSourceText, type PlotInput} from "../source.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const chartEl = $<HTMLElement>("chart");
const sourceEl = $<HTMLElement>("source");
const codeEl = sourceEl.querySelector("code") as HTMLElement;
const errorEl = $<HTMLElement>("error");
const tabChart = $<HTMLButtonElement>("tab-chart");
const tabSource = $<HTMLButtonElement>("tab-source");
const copyBtn = $<HTMLButtonElement>("copy");
const fullscreenBtn = $<HTMLButtonElement>("fullscreen");

let text: string | undefined; // the block's text
let spec: Record<string, unknown> | undefined;
let renderedWidth = 0;

const app = new App({name: "plotdown", version: "0.1.0"}, {}, {autoResize: true});

function showTab(source: boolean) {
  tabChart.setAttribute("aria-selected", String(!source));
  tabSource.setAttribute("aria-selected", String(source));
  chartEl.hidden = source;
  sourceEl.hidden = !source;
}
tabChart.onclick = () => showTab(false);
tabSource.onclick = () => showTab(true);

function showError(path: string, message: string, extra = "") {
  errorEl.hidden = false;
  errorEl.textContent = `Invalid plot block at ${path}${extra}: ${message}`;
}

function availableWidth(): number {
  const style = getComputedStyle(chartEl);
  const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(240, Math.floor(chartEl.clientWidth - pad || document.documentElement.clientWidth - 24));
}

/** Draws the current block; a block without its own width takes the view's width. */
function draw() {
  if (!spec) return;
  const width = availableWidth();
  const options = typeof spec.width === "number" ? spec : {...spec, width};
  try {
    const figure = render(options);
    chartEl.replaceChildren(figure);
    errorEl.hidden = true;
    renderedWidth = width;
  } catch (error) {
    chartEl.replaceChildren();
    if (error instanceof PlotdownError) showError(error.path, error.message);
    else showError("$", error instanceof Error ? error.message : String(error));
    showTab(true);
  }
}

function load(input: unknown) {
  if (input === undefined || input === null) return;
  const next = toSourceText(input as PlotInput);
  if (next === text) return;
  text = next;
  codeEl.textContent = text;
  try {
    const parsed: unknown = JSON.parse(text);
    spec = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    spec = undefined;
  }
  if (spec) draw();
}

// Redraw when the host changes the width (the height follows through autoResize).
let pending = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    if (spec && typeof spec.width !== "number" && Math.abs(availableWidth() - renderedWidth) > 8) draw();
  });
}).observe(chartEl);

copyBtn.onclick = async () => {
  if (text === undefined) return;
  const fence = toFence(text);
  let done = false;
  try {
    await navigator.clipboard.writeText(fence);
    done = true;
  } catch {
    const area = document.createElement("textarea");
    area.value = fence;
    document.body.append(area);
    area.select();
    done = document.execCommand("copy");
    area.remove();
  }
  copyBtn.textContent = done ? "Copied" : "Copy failed";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
};

fullscreenBtn.onclick = async () => {
  const mode = app.getHostContext()?.displayMode === "fullscreen" ? "inline" : "fullscreen";
  await app.requestDisplayMode({mode});
};

function applyContext(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.availableDisplayModes) fullscreenBtn.hidden = !ctx.availableDisplayModes.includes("fullscreen");
  if (ctx.displayMode) fullscreenBtn.textContent = ctx.displayMode === "fullscreen" ? "Collapse" : "Expand";
  const insets = ctx.safeAreaInsets;
  if (insets) document.body.style.padding = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;
}

// Handlers are set before connect, so that no notification is missed.
app.ontoolinput = (params) => load(params.arguments?.plot);
app.ontoolresult = (result) => {
  const error = (result.structuredContent as {error?: {path: string; message: string; line?: number; column?: number}} | undefined)?.error;
  if (result.isError && error) {
    showError(error.path, error.message, error.line !== undefined ? ` (line ${error.line}, column ${error.column})` : "");
    chartEl.replaceChildren();
    showTab(true);
  } else if (result.isError) {
    errorEl.hidden = false;
    errorEl.textContent = result.content?.map((c) => (c.type === "text" ? c.text : "")).join("\n") ?? "The tool failed.";
  }
};
app.ontoolcancelled = () => {
  if (!spec) chartEl.replaceChildren(Object.assign(document.createElement("p"), {className: "status", textContent: "Cancelled."}));
};
app.onhostcontextchanged = (ctx) => {
  applyContext(ctx);
  if (spec && typeof spec.width !== "number") requestAnimationFrame(() => draw());
};
app.onteardown = async () => ({});
app.onerror = (error) => console.error(error);

await app.connect();
const context = app.getHostContext();
if (context) applyContext(context);
