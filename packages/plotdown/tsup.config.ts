import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {cpSync} from "node:fs";
import {defineConfig} from "tsup";

/** Starts a built module with "use client", and moves its source map one line down to match. */
function useClient(file: string): void {
  const code = readFileSync(file, "utf8");
  if (code.startsWith('"use client";')) return;
  writeFileSync(file, `"use client";\n${code}`);
  const map = JSON.parse(readFileSync(`${file}.map`, "utf8"));
  map.mappings = `;${map.mappings}`;
  writeFileSync(`${file}.map`, JSON.stringify(map));
}

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
    streamdown: "src/streamdown.ts",
    browser: "src/browser/index.ts",
    static: "src/static/index.ts",
    link: "src/link/index.ts",
    cli: "src/cli/bin.ts"
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
    // The agent skill and the llms.txt files ship in the package (see scripts/skill.mjs).
    cpSync("../../skills/plot", "dist/skills/plot", {recursive: true});
    copyFileSync("../../docs/llms.txt", "dist/llms.txt");
    copyFileSync("../../docs/llms-full.txt", "dist/llms-full.txt");
    // The React entries draw in effects: in the Next.js App Router they must be
    // client modules. esbuild drops a "use client" directive of a source file
    // when it bundles, so it is put back here, on the entries (their code is in
    // shared chunks, which a client boundary takes along).
    for (const name of ["react", "streamdown"]) useClient(`dist/${name}.js`);
  }
});
