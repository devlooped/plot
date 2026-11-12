// Builds dist/view.html: one self-contained HTML file with the view's script
// (the plotdown core, Observable Plot, d3 and the ext-apps client bundled in)
// and its CSS inlined. Nothing is loaded from the network.
import {mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {build} from "esbuild";

// zod (used by the ext-apps client) ships its error messages in 40-odd
// languages and its namespace export keeps them all: the view only needs
// English, so every other locale resolves to the English one (-250 kB).
const englishOnlyZod = {
  name: "english-only-zod",
  setup(b) {
    b.onLoad({filter: /[\\/]zod[\\/]v4[\\/]locales[\\/][\w-]+\.js$/}, (args) =>
      /[\\/](en|index)\.js$/.test(args.path)
        ? undefined
        : {contents: 'export {default} from "./en.js";', resolveDir: dirname(args.path)}
    );
  }
};

const result = await build({
  entryPoints: ["src/view/main.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  write: false,
  logLevel: "warning",
  plugins: [englishOnlyZod]
});
const script = result.outputFiles[0].text.replace(/<\/(script)/gi, "<\\/$1");
const css = readFileSync("src/view/view.css", "utf8");
const template = readFileSync("src/view/view.html", "utf8");
const html = template
  .replace("<script>/*__SCRIPT__*/</script>", () => `<script type="module">${script}</script>`)
  .replace("/*__STYLE__*/", () => css);
// This is the first step of the build: start from an empty dist (tsup keeps it).
rmSync("dist", {recursive: true, force: true});
mkdirSync("dist", {recursive: true});
writeFileSync("dist/view.html", html);
console.log(`dist/view.html ${(html.length / 1024).toFixed(0)} kB`);
