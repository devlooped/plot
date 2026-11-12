// Bundles the extension into dist/ (esbuild):
//   dist/extension.js           extension host, desktop (Node, CommonJS)
//   dist/web/extension.js       extension host, VS Code for the Web (a worker, CommonJS)
//   dist/preview.js             Markdown preview script (classic script)
//   dist/notebook-markdown.js   notebook: extends vscode.markdown-it-renderer (ES module)
//   dist/notebook-renderer.js   notebook: renderer of application/vnd.plotdown+json (ES module)
// The webview scripts hold the plotdown core, Observable Plot and d3; the host
// bundles hold only the markdown-it plugin and the remote-data loader.
import {rmSync} from "node:fs";
import {fileURLToPath} from "node:url";
import esbuild from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const watch = process.argv.includes("--watch");
const production = !watch;

rmSync(new URL("../dist", import.meta.url), {recursive: true, force: true});

const common = {
  absWorkingDir: root,
  bundle: true,
  minify: production,
  sourcemap: production ? false : "inline",
  target: "es2022",
  legalComments: "none",
  logLevel: "info"
};

const builds = [
  {...common, entryPoints: {extension: "src/extension.ts"}, outdir: "dist", platform: "node", format: "cjs", external: ["vscode"]},
  {...common, entryPoints: {extension: "src/extension.ts"}, outdir: "dist/web", platform: "browser", format: "cjs", external: ["vscode"]},
  {...common, entryPoints: {preview: "src/preview.ts"}, outdir: "dist", platform: "browser", format: "iife"},
  {...common, entryPoints: {"notebook-markdown": "src/notebook-markdown.ts", "notebook-renderer": "src/notebook-renderer.ts"}, outdir: "dist", platform: "browser", format: "esm"}
];

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
