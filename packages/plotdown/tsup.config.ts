import {copyFileSync, mkdirSync} from "node:fs";
import {defineConfig} from "tsup";

// One entry per public module. Later entries (the browser bundle, the CLI, the
// markdown-it/rehype/marked/react/streamdown adapters) are added here and in the
// "exports" map of package.json.
export default defineConfig({
  entry: {
    static: "src/static/index.ts",
    cli: "src/cli/bin.ts",
    index: "src/index.ts"
  },
  format: ["esm"],
  platform: "neutral",
  target: "es2022",
  outDir: "dist",
  clean: true,
  dts: false, // declarations come from tsc (see the build script)
  sourcemap: true,
  splitting: true,
  treeshake: true,
  external: ["@observablehq/plot"],
  onSuccess: async () => {
    mkdirSync("dist", {recursive: true});
    copyFileSync("../../spec/plot.schema.json", "dist/plot.schema.json");
  }
});
