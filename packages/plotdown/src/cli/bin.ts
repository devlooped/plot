#!/usr/bin/env node
/// <reference types="node" />
// The `plotdown` executable.
import fs from "node:fs";
import {main} from "./index.js";

// `plotdown link doc.md | head -1` closes the pipe early: that is not an error.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(process.exitCode ?? 0);
  throw error;
});

process.exitCode = main(process.argv.slice(2), {
  cwd: process.cwd(),
  log: (line) => process.stdout.write(`${line}\n`),
  error: (line) => process.stderr.write(`${line}\n`),
  env: process.env,
  stdin: () => fs.readFileSync(0, "utf8")
});
