// Copies the built plugin into a vault, to try it in Obsidian:
//   pnpm --filter plotdown-obsidian build
//   pnpm --filter plotdown-obsidian vault -- <path to the vault> [--sample]
// or set OBSIDIAN_VAULT instead of passing the path. Writes
// <vault>/.obsidian/plugins/plotdown/{main.js,manifest.json,styles.css} and keeps
// the plugin's data.json (its settings). --sample also copies sample/plotdown.md
// to the root of the vault. Then, in Obsidian: Settings → Community plugins →
// turn on "Plotdown" (or reload it after a new build).
import {copyFileSync, existsSync, mkdirSync, statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => a !== "--");
const sample = args.includes("--sample");
const vault = args.find((a) => !a.startsWith("--")) ?? process.env.OBSIDIAN_VAULT;

function fail(message) {
  console.error(`plotdown: ${message}`);
  process.exit(1);
}

if (!vault) fail("pass the path of a vault, or set OBSIDIAN_VAULT");
const vaultDir = path.resolve(vault);
if (!existsSync(path.join(vaultDir, ".obsidian")) || !statSync(path.join(vaultDir, ".obsidian")).isDirectory()) {
  fail(`${vaultDir} is not a vault (it has no .obsidian folder): open it once in Obsidian first`);
}
const files = ["main.js", "manifest.json", "styles.css"];
for (const file of files) {
  if (!existsSync(path.join(root, "dist", file))) fail(`dist/${file} is missing: run the build first`);
}
const target = path.join(vaultDir, ".obsidian", "plugins", "plotdown");
mkdirSync(target, {recursive: true});
for (const file of files) copyFileSync(path.join(root, "dist", file), path.join(target, file));
console.log(`plotdown: copied ${files.join(", ")} to ${target}`);
if (sample) {
  copyFileSync(path.join(root, "sample", "plotdown.md"), path.join(vaultDir, "plotdown.md"));
  console.log(`plotdown: copied the sample note to ${path.join(vaultDir, "plotdown.md")}`);
}
