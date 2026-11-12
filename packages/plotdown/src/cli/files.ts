/// <reference types="node" />
// Expands the files and globs given on the command line.
import fs from "node:fs";
import path from "node:path";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);

function isSkipped(entry: string | {name: string}): boolean {
  const name = typeof entry === "string" ? path.basename(entry) : entry.name;
  return SKIPPED_DIRECTORIES.has(name);
}

/**
 * The files that the patterns name, as absolute paths, sorted and without
 * duplicates. A pattern that is an existing file is taken as is; any other is a
 * glob (`**`, `*`, `?`, `{a,b}`), resolved from cwd, that never enters
 * node_modules or .git.
 */
export function expandFiles(patterns: readonly string[], cwd: string): {files: string[]; unmatched: string[]} {
  const files = new Set<string>();
  const unmatched: string[] = [];
  for (const pattern of patterns) {
    const direct = path.resolve(cwd, pattern);
    if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
      files.add(direct);
      continue;
    }
    const matches = fs
      .globSync(pattern.replace(/\\/g, "/"), {cwd, exclude: isSkipped as (entry: string) => boolean})
      .map((match) => path.resolve(cwd, match))
      .filter((match) => fs.statSync(match).isFile());
    if (matches.length === 0) unmatched.push(pattern);
    for (const match of matches) files.add(match);
  }
  return {files: Array.from(files).sort(), unmatched};
}

/** A path relative to a directory, with forward slashes. */
export function relativePath(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join("/");
}
