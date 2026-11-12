// Bundles the plugin, the plotdown core and Observable Plot into dist/main.js,
// next to manifest.json and styles.css: the three files of a release.
//   node esbuild.config.mjs           production build (minified)
//   node esbuild.config.mjs --watch   rebuilds on change, with inline source maps
import {copyFileSync, mkdirSync} from "node:fs";
import esbuild from "esbuild";
import {buildOptions} from "./build.options.mjs";

const watch = process.argv.includes("--watch");

function copyAssets() {
  mkdirSync("dist", {recursive: true});
  copyFileSync("manifest.json", "dist/manifest.json");
  copyFileSync("styles.css", "dist/styles.css");
}

const options = {...buildOptions({watch}), logLevel: "info"};
if (watch) {
  const context = await esbuild.context({...options, plugins: [{name: "assets", setup: (build) => build.onEnd(copyAssets)}]});
  await context.watch();
} else {
  await esbuild.build(options);
  copyAssets();
}
