// Sets the version of the plugin in package.json and manifest.json, and records
// in versions.json the minimum Obsidian version it needs (manifest.minAppVersion).
// Obsidian reads manifest.json and versions.json from the root of the repository,
// so both are also copied there:
//   pnpm --filter plotdown-obsidian bump -- 0.2.0
// The GitHub release of that version must be tagged exactly 0.2.0 (no "v").
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv.slice(2).find((a) => a !== "--");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("plotdown: pass the new version as x.y.z (Obsidian accepts no other form)");
  process.exit(1);
}
const read = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const write = (file, value) => writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + "\n");

const pkg = read("package.json");
const manifest = read("manifest.json");
const versions = read("versions.json");
pkg.version = version;
manifest.version = version;
versions[version] = manifest.minAppVersion;
write("package.json", pkg);
write("manifest.json", manifest);
write("versions.json", versions);
// The copies Obsidian reads, at the root of the repository.
write("../../manifest.json", manifest);
write("../../versions.json", versions);
console.log(`plotdown: version ${version}, minAppVersion ${manifest.minAppVersion}`);
