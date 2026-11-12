import {copyFileSync, mkdirSync} from "node:fs";
import {defineConfig} from "tsup";

// The server and the CLI. The view is built first by scripts/build-view.mjs
// (dist/view.html); the spec and the schema are copied next to it.
export default defineConfig({
  entry: {index: "src/index.ts", cli: "src/cli.ts"},
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: false, // keeps dist/view.html
  dts: false, // declarations come from tsc
  sourcemap: true,
  splitting: true,
  treeshake: true,
  onSuccess: async () => {
    mkdirSync("dist", {recursive: true});
    copyFileSync("../../spec/spec.md", "dist/spec.md");
    copyFileSync("../../spec/plot.schema.json", "dist/plot.schema.json");
  }
});
