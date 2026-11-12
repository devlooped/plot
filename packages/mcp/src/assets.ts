// The files the server serves: the view (built by scripts/build-view.mjs), the
// spec and the schema (copied from /spec by tsup). They sit next to the bundle
// in dist; when the server runs from src (tests), they are read from ../dist.
import {existsSync, readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cache = new Map<string, string>();

/** Reads a built asset by file name: view.html, spec.md or plot.schema.json. */
export function readAsset(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  for (const dir of [here, join(here, "..", "dist")]) {
    const file = join(dir, name);
    if (existsSync(file)) {
      const text = readFileSync(file, "utf8");
      cache.set(name, text);
      return text;
    }
  }
  throw new Error(`plotdown-mcp: ${name} not found next to ${here}; run \`pnpm build\` in packages/mcp`);
}
