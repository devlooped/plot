// Builds the extension and packs it as pack/plotdown-<version>.vsix, the file
// that both the Visual Studio Marketplace (vsce publish --packagePath) and
// Open VSX (ovsx publish) take. The bundles hold every dependency, so vsce
// packs no node_modules (--no-dependencies).
import {execFileSync} from "node:child_process";
import {copyFileSync, mkdirSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";

const run = (file, args) => execFileSync(process.execPath, [file, ...args], {stdio: "inherit"});
const {version} = JSON.parse(readFileSync("package.json", "utf8"));
run("scripts/build.mjs", []);
// vsce takes the license from the extension's folder only: a copy of the repository's.
copyFileSync("../../LICENSE", "LICENSE");
mkdirSync("pack", {recursive: true});
const vsce = createRequire(import.meta.url).resolve("@vscode/vsce/vsce");
run(vsce, ["package", "--no-dependencies", "--out", `pack/plotdown-${version}.vsix`]);
