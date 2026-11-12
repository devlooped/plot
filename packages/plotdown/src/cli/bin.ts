#!/usr/bin/env node
/// <reference types="node" />
// The `plotdown` executable.
import {main} from "./index.js";

process.exitCode = main(process.argv.slice(2), {
  cwd: process.cwd(),
  log: (line) => process.stdout.write(`${line}\n`),
  error: (line) => process.stderr.write(`${line}\n`),
  env: process.env
});
