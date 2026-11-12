// Packs the built extensions for the stores, into dist/stores:
//   plotdown-chrome-<version>.zip    Chrome Web Store and Edge Add-ons (the same package)
//   plotdown-firefox-<version>.zip   Firefox Add-ons (AMO)
//   plotdown-source-<version>.zip    the source AMO asks for (plotdown.iife.js is minified): git archive of HEAD
// and the known-hosts variant (*-known-*.zip) when it was built (node build.mjs --sites=known).
// Run after `pnpm build`. Uploading is left to a person.
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import zlib from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(root, "dist");
const out = path.join(dist, "stores");
const {version} = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

/** All files under dir, as paths relative to it with forward slashes, sorted. */
function list(dir, prefix = "") {
  return fs
    .readdirSync(dir, {withFileTypes: true})
    .flatMap((entry) => (entry.isDirectory() ? list(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]))
    .sort();
}

/** A zip archive (deflate, no directory entries) of the given files, with a fixed date so that a rebuild gives the same bytes. */
export function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  const time = 0, date = (2026 - 1980) << 9 | 1 << 5 | 1; // 2026-01-01 00:00
  for (const {name, data} of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const deflated = zlib.deflateRawSync(data, {level: 9});
    const crc = zlib.crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(deflated.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, deflated);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + deflated.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(out, {recursive: true});
  const packed = [];
  for (const name of ["chrome", "firefox", "chrome-known", "firefox-known"]) {
    const dir = path.join(dist, name);
    if (!fs.existsSync(path.join(dir, "manifest.json"))) {
      if (!name.endsWith("-known")) throw new Error(`dist/${name} is missing: run pnpm build first`);
      continue;
    }
    const files = list(dir).map((file) => ({name: file, data: fs.readFileSync(path.join(dir, file))}));
    const target = path.join(out, `plotdown-${name.replace("-known", "")}${name.endsWith("-known") ? "-known" : ""}-${version}.zip`);
    fs.writeFileSync(target, zip(files));
    packed.push(target);
  }
  // AMO reviews minified code against its source: the repository at HEAD, with its build steps (store/readme.md).
  const source = path.join(out, `plotdown-source-${version}.zip`);
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {cwd: root, encoding: "utf8"}).trim();
    execFileSync("git", ["archive", "--format=zip", `--output=${source}`, "HEAD"], {cwd: top, stdio: "pipe"});
    packed.push(source);
  } catch (error) {
    console.warn(`no source archive (git archive failed): ${error.message}`);
  }
  for (const file of packed) console.log(`${path.relative(root, file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} kB`);
}
