// Builds the unpacked extensions and the userscript into dist:
//   dist/chrome/          Chrome and Edge (load unpacked, or zip for the stores: pnpm pack)
//   dist/firefox/         Firefox
//   dist/plotdown.user.js the userscript
// With --sites=known, the known-hosts variant (see manifest.mjs) instead, in
// dist/chrome-known and dist/firefox-known.
//
// plotdown.js is not rebuilt here: it is copied from packages/plotdown/dist
// (built before this package, which depends on it), since stores forbid code
// loaded from elsewhere at run time.
import {copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import esbuild from "esbuild";
import {createManifest} from "./manifest.mjs";
import {createUserscript, stripSourceMap} from "./userscript.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const at = (...parts) => path.join(here, ...parts);
const sites = process.argv.find((arg) => arg.startsWith("--sites="))?.slice("--sites=".length) ?? "all";
if (sites !== "all" && sites !== "known") throw new Error(`--sites must be "all" or "known", not "${sites}"`);
const suffix = sites === "known" ? "-known" : "";

const {version} = JSON.parse(readFileSync(at("package.json"), "utf8"));
const plotdownFile = fileURLToPath(import.meta.resolve("@devlooped/plotdown/plotdown.iife.js"));
if (!existsSync(plotdownFile)) throw new Error(`${plotdownFile} is missing: build packages/plotdown first (pnpm build at the root does both).`);
const plotdown = stripSourceMap(readFileSync(plotdownFile, "utf8"));

/** Small, readable bundles: store reviewers read them. plotdown.js is the only minified file. */
const common = {bundle: true, format: "iife", platform: "browser", target: "es2022", minify: false, legalComments: "none", charset: "utf8", logLevel: "warning"};
const bundle = async (entry) => {
  const result = await esbuild.build({...common, entryPoints: [at("src", entry)], write: false});
  return result.outputFiles[0].text;
};
const [content, background, popup, detector] = await Promise.all(["content.ts", "background.ts", "popup.ts", "userscript.ts"].map(bundle));

if (sites === "all") rmSync(at("dist"), {recursive: true, force: true});
for (const browser of ["chrome", "firefox"]) {
  const out = at("dist", browser + suffix);
  rmSync(out, {recursive: true, force: true});
  mkdirSync(out, {recursive: true});
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify(createManifest({browser, sites, version}), null, 2) + "\n");
  writeFileSync(path.join(out, "content.js"), content);
  writeFileSync(path.join(out, "background.js"), background);
  writeFileSync(path.join(out, "popup.js"), popup);
  writeFileSync(path.join(out, "plotdown.iife.js"), plotdown);
  copyFileSync(at("src", "popup.html"), path.join(out, "popup.html"));
  copyFileSync(at("src", "popup.css"), path.join(out, "popup.css"));
  cpSync(at("icons"), path.join(out, "icons"), {recursive: true, filter: (file) => !file.endsWith(".svg")});
  copyFileSync(at("..", "..", "LICENSE"), path.join(out, "LICENSE"));
}
if (sites === "all") writeFileSync(at("dist", "plotdown.user.js"), createUserscript({version, detector, plotdown}));

const kB = (text) => `${(Buffer.byteLength(text) / 1024).toFixed(1)} kB`;
console.log(`plotdown extension ${version} (${sites} sites): dist/chrome${suffix}, dist/firefox${suffix}${sites === "all" ? ", dist/plotdown.user.js" : ""}`);
console.log(`  content.js (detector) ${kB(content)}, plotdown.iife.js ${kB(plotdown)}`);
