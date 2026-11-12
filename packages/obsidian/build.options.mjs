// The esbuild options of the plugin's bundle, shared by esbuild.config.mjs and the tests.
import {builtinModules} from "node:module";

/** @param {{watch?: boolean}} [mode] */
export function buildOptions({watch = false} = {}) {
  return {
    entryPoints: ["src/main.ts"],
    bundle: true,
    // Provided by Obsidian at run time. Node built-ins are listed so that a stray
    // import shows up as a require() the tests catch, instead of a bundled shim.
    external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
    format: "cjs",
    platform: "browser",
    target: "es2021",
    treeShaking: true,
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    legalComments: "eof",
    outfile: "dist/main.js"
  };
}
