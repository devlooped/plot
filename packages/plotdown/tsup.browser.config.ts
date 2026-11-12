import {readFileSync} from "node:fs";
import {defineConfig, type Options} from "tsup";

// plotdown.js: the whole renderer in one self-contained, minified file (the
// core, Observable Plot and d3 inside, nothing imported at run time), as ESM
// (dist/plotdown.js, for <script type="module">) and as a classic-script IIFE
// (dist/plotdown.iife.js, for extensions, userscripts and plain <script>).
// Built after tsup.config.ts, which cleans dist.
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {version: string; dependencies: Record<string, string>};
const banner = `/*! plotdown.js ${pkg.version} | MIT | https://github.com/devlooped/plotdown
 * Includes Observable Plot ${pkg.dependencies["@observablehq/plot"]} (ISC, Copyright 2020-2025 Observable, Inc.) and d3 (ISC, Copyright 2010-2023 Mike Bostock).
 * plotdown is not affiliated with Observable, Inc. */`;

const common: Options = {
  entry: {plotdown: "src/browser/auto.ts"},
  outDir: "dist",
  platform: "browser",
  target: "es2022",
  clean: false,
  dts: false,
  sourcemap: true,
  minify: true,
  splitting: false,
  treeshake: false, // esbuild's own tree shaking; rollup's adds nothing here
  noExternal: [/.*/],
  banner: {js: banner}
};

export default defineConfig([
  {...common, format: ["esm"]},
  {...common, format: ["iife"], outExtension: () => ({js: ".iife.js"})}
]);
