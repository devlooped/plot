import {copyFileSync, mkdirSync} from "node:fs";
import {defineConfig} from "tsup";

// One entry per public module. Later entries (the browser bundle, the CLI, the
// markdown-it/rehype/marked/react/streamdown adapters) are added here and in the
// "exports" map of package.json.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "markdown-it": "src/markdown-it.ts",
    rehype: "src/rehype.ts",
    marked: "src/marked.ts",
    react: "src/react.ts",
    streamdown: "src/streamdown.ts"
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
