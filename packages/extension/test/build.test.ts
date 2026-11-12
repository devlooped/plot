// @vitest-environment node
import {fileURLToPath} from "node:url";
import esbuild from "esbuild";
import {describe, expect, it} from "vitest";
import {ALL_SITES, createManifest, GECKO_ID, KNOWN_HOSTS} from "../manifest.mjs";
import {createUserscript, stripSourceMap} from "../userscript.mjs";

const src = (file: string) => fileURLToPath(new URL(`../src/${file}`, import.meta.url));
const bundle = async (file: string) =>
  (await esbuild.build({entryPoints: [src(file)], bundle: true, format: "iife", platform: "browser", target: "es2022", write: false, logLevel: "silent"})).outputFiles[0]!.text;

describe("manifest", () => {
  it("covers every site, with the detector in every frame and nothing else up front", () => {
    const manifest = createManifest({browser: "chrome", version: "1.2.3"});
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe("1.2.3");
    expect(manifest.host_permissions).toEqual(ALL_SITES);
    expect(manifest.content_scripts).toEqual([{matches: ALL_SITES, js: ["content.js"], run_at: "document_idle", all_frames: true}]);
    expect(manifest.permissions).toEqual(["scripting", "storage", "activeTab"]);
    expect(manifest.background).toEqual({service_worker: "background.js"});
    expect(manifest.optional_host_permissions).toBeUndefined();
    // plotdown.js is injected on demand, never exposed to pages.
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.content_security_policy).toBeUndefined();
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  it("gives Firefox an event page, an id, and no data collection", () => {
    const manifest = createManifest({browser: "firefox", version: "1.2.3"});
    expect(manifest.background).toEqual({scripts: ["background.js"]});
    expect(manifest.browser_specific_settings.gecko.id).toBe(GECKO_ID);
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions).toEqual({required: ["none"]});
    expect(manifest.minimum_chrome_version).toBeUndefined();
  });

  it("the known-hosts variant lists the hosts and asks for the others", () => {
    const manifest = createManifest({browser: "chrome", sites: "known", version: "1.2.3"});
    const matches = KNOWN_HOSTS.map((host) => `https://${host}/*`);
    expect(manifest.host_permissions).toEqual(matches);
    expect(manifest.content_scripts[0].matches).toEqual(matches);
    expect(manifest.optional_host_permissions).toEqual(ALL_SITES);
  });
});

describe("bundles", () => {
  it("keeps Plot and d3 out of the content script that every page receives", async () => {
    const content = await bundle("content.ts");
    expect(content.length).toBeLessThan(20_000);
    expect(content).not.toMatch(/observablehq|d3-/);
    // The selector table comes from plotdown.js's own source.
    expect(content).toContain("highlight-source-gnuplot");
    expect(content).toContain("data-canonical-lang");
  });

  it("the background makes no network request", async () => {
    for (const file of ["background.ts", "content.ts", "popup.ts"]) {
      expect(await bundle(file)).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
    }
  });
});

describe("userscript", () => {
  const plotdown = "/*! plotdown.js */\nvar plotdown=(()=>{globalThis.started=true})();\n//# sourceMappingURL=plotdown.iife.js.map\n";

  it("has a header for every site and wraps plotdown.js in a function", () => {
    const script = createUserscript({version: "1.2.3", detector: "loadPlotdown();", plotdown});
    expect(script.startsWith("// ==UserScript==\n")).toBe(true);
    expect(script).toMatch(/^\/\/ @match {8}\*:\/\/\*\/\*$/m);
    expect(script).toMatch(/^\/\/ @version {6}1\.2\.3$/m);
    expect(script).toMatch(/^\/\/ @grant {8}none$/m);
    expect(script).not.toContain("sourceMappingURL");
  });

  it("runs plotdown.js only when the detector asks, with remote data off", () => {
    const run = (detector: string) => {
      const scope = {plotdownConfig: {allowRemote: true}} as Record<string, unknown>;
      const script = createUserscript({version: "1", detector, plotdown}).replaceAll("globalThis", "scope");
      new Function("scope", script)(scope);
      return scope;
    };
    expect(run("/* no block */").started).toBeUndefined();
    const scope = run("loadPlotdown();");
    expect(scope.started).toBe(true);
    expect(scope.plotdownConfig).toEqual({allowRemote: false, auto: true});
  });

  it("strips the source map comment with either line ending", () => {
    expect(stripSourceMap("a();\r\n//# sourceMappingURL=x.map\r\n")).toBe("a();\n");
    expect(stripSourceMap("a();\n//# sourceMappingURL=x.map")).toBe("a();\n");
  });
});
