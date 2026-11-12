// plotdown.js: the script-tag build. It renders the plot blocks of the page by
// itself and exposes the API as globalThis.plotdown, for module and classic
// scripts alike.
//
//   <script type="module" src="https://cdn.jsdelivr.net/npm/@devlooped/plotdown/dist/plotdown.js"></script>
//
// Options come from data attributes of the script tag, then from a
// globalThis.plotdownConfig object set before the script runs (what an
// extension or a userscript does, having no tag):
//
//   data-auto="false"                 do not start; call plotdown.start() later
//   data-allow-remote="true"          or a list of origins: "https://a.example https://b.example"
//   data-theme="light"                "auto" (default), "light" or "dark"
//   data-toggle="false"               no chart/source button
//   data-copy="false"                 no Copy button (JSON, PNG, SVG)
//   data-settle="3000"                ms before a block that does not parse shows its error; "false": never
import * as api from "./index.js";
import type {BrowserOptions} from "./renderer.js";

export * from "./index.js";

/** The options of the script build: those of the API, plus auto. */
export interface ScriptOptions extends BrowserOptions {
  /** Start by itself once the document is parsed (default true). */
  auto?: boolean;
}

type Api = typeof api;

declare global {
  // eslint-disable-next-line no-var
  var plotdown: Api | undefined;
  // eslint-disable-next-line no-var
  var plotdownConfig: ScriptOptions | undefined;
}

const SCRIPT_NAME = /\/plotdown(?:\.iife)?(?:\.min)?\.js(?:[?#]|$)/;

/** The script element that loaded plotdown.js, if it can be found. */
function findScript(): HTMLScriptElement | null {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement) return current;
  const marked = document.querySelector<HTMLScriptElement>("script[data-plotdown]");
  if (marked) return marked;
  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))) {
    if (SCRIPT_NAME.test(script.src)) return script;
  }
  return null;
}

function flag(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return !/^(false|no|off|0)$/i.test(value.trim());
}

/** Reads the options of a script tag's data attributes. */
export function readScriptOptions(script: HTMLOrSVGScriptElement | Element | null): ScriptOptions {
  const options: ScriptOptions = {};
  if (!script || !("dataset" in script)) return options;
  const data = (script as HTMLElement).dataset;
  const auto = flag(data.auto);
  if (auto !== undefined) options.auto = auto;
  const toggle = flag(data.toggle);
  if (toggle !== undefined) options.toggle = toggle;
  const copy = flag(data.copy);
  if (copy !== undefined) options.copy = copy;
  if (data.theme === "light" || data.theme === "dark" || data.theme === "auto") options.theme = data.theme;
  if (data.settle !== undefined) options.settle = flag(data.settle) === false ? false : Number(data.settle) || 0;
  if (data.allowRemote !== undefined) {
    const value = data.allowRemote.trim();
    const origins = value.split(/[\s,]+/).filter((word) => /^https?:\/\//i.test(word));
    options.allowRemote = origins.length ? origins : flag(value || "true")!;
  }
  if (data.baseUrl) options.baseUrl = data.baseUrl;
  return options;
}

if (typeof document !== "undefined" && !globalThis.plotdown) {
  globalThis.plotdown = api;
  const {auto = true, ...options} = {...readScriptOptions(findScript()), ...globalThis.plotdownConfig};
  if (auto) void api.start(options);
  else api.configure(options);
}
