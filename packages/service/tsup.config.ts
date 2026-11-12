import {defineConfig} from "tsup";

// The library, the Vercel entry, the worker thread of the render pool and the
// local server. dist/worker.js must sit next to the chunk that starts it (the
// pool finds it with new URL("./worker.js", import.meta.url)), and the fonts
// stay in ../fonts, next to dist.
export default defineConfig({
  entry: {index: "src/index.ts", vercel: "src/vercel.ts", worker: "src/worker.ts", serve: "src/serve.ts"},
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  dts: false, // declarations come from tsc
  sourcemap: true,
  splitting: true,
  treeshake: true
});
