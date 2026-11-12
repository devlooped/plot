import fs from "node:fs";
import path from "node:path";
import type {MarkdownPostProcessorContext} from "obsidian";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import PlotdownPlugin from "../src/main.js";
import {requestUrlFetch} from "../src/fetch.js";
import {describeError, renderBlock} from "../src/render.js";
import {PlotdownSettingTab} from "../src/settings.js";
import * as obsidian from "./obsidian-stub.js";

const ctx = {sourcePath: "note.md"} as unknown as MarkdownPostProcessorContext;

const BAR = JSON.stringify({
  marks: [{mark: "barY", data: [{a: "x", b: 1}, {a: "y", b: 2}], x: "a", y: "b"}, {mark: "ruleY", data: [0]}]
});
const TITLED = JSON.stringify({title: "Counts", marks: [{mark: "dot", data: [{a: 1, b: 2}], x: "a", y: "b"}]});
const REMOTE = JSON.stringify({marks: [{mark: "dot", data: {url: "https://example.com/data.csv"}, x: "a", y: "b"}]});

async function load(data: unknown = null): Promise<PlotdownPlugin> {
  const plugin = new PlotdownPlugin(new obsidian.App() as never, {} as never);
  (plugin as unknown as obsidian.Plugin).data = data;
  await plugin.onload();
  return plugin;
}

function host(plugin: PlotdownPlugin): obsidian.Plugin {
  return plugin as unknown as obsidian.Plugin;
}

async function run(plugin: PlotdownPlugin, language: string, source: string): Promise<HTMLElement> {
  const el = document.createElement("div");
  document.body.append(el);
  await host(plugin).processors.get(language)!(source, el, ctx);
  return el;
}

beforeEach(() => {
  obsidian.takenLanguages.clear();
  obsidian.requestUrlCalls.length = 0;
  obsidian.setRequestUrlHandler(async () => {
    throw new Error("no requestUrl handler");
  });
});
afterEach(() => {
  document.body.replaceChildren();
});

describe("plugin", () => {
  it("registers the three fence names and a settings tab", async () => {
    const plugin = await load();
    expect([...host(plugin).processors.keys()]).toEqual(["plot", "oplot", "observable-plot"]);
    expect(host(plugin).settingTabs).toHaveLength(1);
    expect(plugin.settings).toEqual({allowRemote: false});
  });

  it("keeps the other names when another plugin already took one", async () => {
    obsidian.takenLanguages.add("plot");
    const error = console.error;
    console.error = () => {};
    try {
      const plugin = await load();
      expect([...host(plugin).processors.keys()]).toEqual(["oplot", "observable-plot"]);
    } finally {
      console.error = error;
    }
  });

  it.each(["plot", "oplot", "observable-plot"])("renders a ```%s block as a chart", async (language) => {
    const plugin = await load();
    const el = await run(plugin, language, BAR);
    expect(el.classList.contains("plotdown")).toBe(true);
    const svg = el.querySelector(".plotdown-chart > svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(el.querySelector(".plotdown-error")).toBeNull();
  });

  it("renders a chart with a title as a figure", async () => {
    const el = await run(await load(), "plot", TITLED);
    const figure = el.querySelector(".plotdown-chart > figure");
    expect(figure?.querySelector("h2")?.textContent).toBe("Counts");
    expect(figure?.querySelector("svg")).not.toBeNull();
  });

  it("draws with currentColor so that the theme's text color applies", async () => {
    const el = await run(await load(), "plot", BAR);
    expect(el.querySelector("svg")!.getAttribute("fill")).toBe("currentColor");
  });

  it("creates the chart in the element's own document (popout windows)", async () => {
    const other = document.implementation.createHTMLDocument("popout");
    const el = other.createElement("div");
    other.body.append(el);
    await host(await load()).processors.get("plot")!(BAR, el, ctx);
    expect(el.querySelector("svg")!.ownerDocument).toBe(other);
  });
});

describe("sample note", () => {
  const note = fs.readFileSync(path.resolve(__dirname, "../sample/plotdown.md"), "utf8");
  const blocks = [...note.matchAll(/^```(plot|oplot|observable-plot)\r?\n([\s\S]*?)^```\r?$/gm)].map((m) => ({language: m[1]!, source: m[2]!}));

  it("renders every block but the last, which shows its mistake", async () => {
    expect(blocks).toHaveLength(4);
    const plugin = await load();
    for (const [i, {language, source}] of blocks.entries()) {
      const el = await run(plugin, language, source);
      if (i < blocks.length - 1) expect(el.querySelector(".plotdown-error")?.textContent).toBeUndefined();
      else expect(el.querySelector(".plotdown-error")!.textContent).toContain("$.marks[0].mark");
    }
  });
});

describe("errors", () => {
  it("shows the source and the reason with its JSON path", async () => {
    const source = JSON.stringify({marks: [{mark: "dott", data: [1], x: "a"}]});
    const el = await run(await load(), "plot", source);
    expect(el.classList.contains("plotdown-failed")).toBe(true);
    expect(el.querySelector("pre > code")!.textContent).toBe(source);
    const reason = el.querySelector(".plotdown-error")!.textContent!;
    expect(reason).toContain("$.marks[0].mark");
    expect(el.querySelector("svg")).toBeNull();
  });

  it("gives line and column for invalid JSON", async () => {
    const el = await run(await load(), "plot", '{\n  "marks" []\n}');
    const reason = el.querySelector(".plotdown-error")!.textContent!;
    expect(reason).toMatch(/line 2/);
  });

  it("keeps markup in the source as text", async () => {
    const source = '<img src=x onerror="alert(1)">';
    const el = await run(await load(), "plot", source);
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("pre > code")!.textContent).toBe(source);
  });

  it("explains non-plotdown errors too", () => {
    expect(describeError(new Error("boom"))).toEqual(["plotdown: boom"]);
  });
});

describe("remote data", () => {
  it("is refused by default, with a hint to the setting, and nothing is requested", async () => {
    const el = await run(await load(), "plot", REMOTE);
    const reason = el.querySelector(".plotdown-error")!.textContent!;
    expect(reason).toContain("$.marks[0].data");
    expect(reason).toContain("Load remote data");
    expect(obsidian.requestUrlCalls).toHaveLength(0);
  });

  it("loads through requestUrl once the setting is on", async () => {
    obsidian.setRequestUrlHandler(async () => obsidian.textResponse("a,b\n1,2\n3,4\n"));
    const el = await run(await load({allowRemote: true}), "plot", REMOTE);
    expect(el.querySelector(".plotdown-error")?.textContent).toBeUndefined();
    expect(el.querySelectorAll("svg circle")).toHaveLength(2);
    expect(obsidian.requestUrlCalls).toEqual([{url: "https://example.com/data.csv", method: "GET", throw: false}]);
  });

  it("reports an HTTP error at the data's path", async () => {
    obsidian.setRequestUrlHandler(async () => obsidian.textResponse("nope", 404));
    const el = await run(await load({allowRemote: true}), "plot", REMOTE);
    const reason = el.querySelector(".plotdown-error")!.textContent!;
    expect(reason).toContain("HTTP 404");
    expect(reason).toContain("$.marks[0].data.url");
  });

  it("refuses relative URLs (vault files)", async () => {
    const fetch = requestUrlFetch(obsidian.requestUrl);
    await expect(fetch("data.csv")).rejects.toThrow(/only http and https/);
    expect(obsidian.requestUrlCalls).toHaveLength(0);
  });

  it("honors the abort signal", async () => {
    obsidian.setRequestUrlHandler(() => new Promise(() => {}));
    const fetch = requestUrlFetch(obsidian.requestUrl);
    const controller = new AbortController();
    const pending = fetch("https://example.com/x", {signal: controller.signal});
    controller.abort(new Error("timed out"));
    await expect(pending).rejects.toThrow("timed out");
  });

  it("gives a 204 response no body", async () => {
    obsidian.setRequestUrlHandler(async () => obsidian.textResponse("", 204));
    const response = await requestUrlFetch(obsidian.requestUrl)("https://example.com/x");
    expect(response.status).toBe(204);
  });

  it("renders through the block options directly", async () => {
    const el = document.createElement("div");
    await renderBlock(REMOTE, el, {allowRemote: false});
    expect(el.querySelector(".plotdown-error")).not.toBeNull();
  });
});

describe("settings", () => {
  it("turns remote data on and saves it", async () => {
    const plugin = await load();
    const tab = host(plugin).settingTabs[0] as unknown as PlotdownSettingTab;
    obsidian.Setting.toggles.length = 0;
    tab.display();
    expect(tab.containerEl.textContent).toContain("Load remote data");
    const toggle = obsidian.Setting.toggles[0]!;
    expect(toggle.getValue()).toBe(false);
    await toggle.click();
    expect(plugin.settings.allowRemote).toBe(true);
    expect(host(plugin).data).toEqual({allowRemote: true});
    // A second display does not duplicate the setting.
    tab.display();
    expect(tab.containerEl.querySelectorAll(".setting-item")).toHaveLength(1);
  });
});