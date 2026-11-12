/// <reference types="node" />
// The plotdown command line. Each command is an entry of COMMANDS: a later
// `plotdown link` adds one, and `render --link` an option of render.
import {parseArgs} from "node:util";
import {parseHTML} from "linkedom";
import type {StaticTheme} from "../static/index.js";
import {runRender} from "./render.js";

export interface CommandIo {
  cwd: string;
  log: (line: string) => void;
  error: (line: string) => void;
  env: Record<string, string | undefined>;
}

interface Command {
  summary: string;
  usage: string;
  run(args: string[], io: CommandIo): number;
}

/**
 * The document the CLI draws with. linkedom rather than jsdom: it is a few
 * small packages instead of dozens (the GitHub Action installs it on every
 * run), starts faster, and is what serverless and edge runtimes can run, so
 * the CLI and an image service draw with the same DOM. The static renderer
 * writes the same bytes with either.
 */
export function createDocument(): Document {
  return parseHTML("<!DOCTYPE html><html><head></head><body></body></html>").document as unknown as Document;
}

const RENDER_USAGE = `Usage: plotdown render [options] <files or globs…>

Renders every plot block (\`\`\`plot, \`\`\`oplot, \`\`\`observable-plot) of the Markdown
files as an SVG file, and puts an image line after each block:

  ![Title](docs/plots/readme-1f3a9c.svg) <!-- plot:1f3a9c -->

The block stays. A second run changes nothing; SVG files of a Markdown file
that it no longer references are removed.

Options:
  --out <dir>      where the SVG files go (default: docs/plots)
  --check          change nothing; exit with 1 when a run would change something
  --theme <theme>  auto (default: light or dark, as the reader's color scheme), light, dark
  -h, --help       show this help

Globs are resolved from the current directory and skip node_modules and .git;
quote them so that the shell does not expand them: plotdown render "**/*.md"`;

const THEMES = new Set(["auto", "light", "dark"]);

const COMMANDS: Record<string, Command> = {
  render: {
    summary: "render the plot blocks of Markdown files as SVG images",
    usage: RENDER_USAGE,
    run(args, io) {
      const {values, positionals} = parseArgs({
        args,
        allowPositionals: true,
        options: {
          out: {type: "string", default: "docs/plots"},
          check: {type: "boolean", default: false},
          theme: {type: "string", default: "auto"},
          help: {type: "boolean", short: "h", default: false}
        }
      });
      if (values.help) {
        io.log(RENDER_USAGE);
        return 0;
      }
      if (!THEMES.has(values.theme)) throw new UsageError(`unknown theme "${values.theme}": use auto, light or dark`);
      if (positionals.length === 0) throw new UsageError("name the Markdown files to render, such as: plotdown render readme.md");
      return runRender({
        patterns: positionals,
        cwd: io.cwd,
        outDir: values.out,
        check: values.check,
        theme: values.theme as StaticTheme,
        document: createDocument(),
        log: io.log,
        error: io.error,
        annotate: io.env.GITHUB_ACTIONS === "true"
      });
    }
  }
};

class UsageError extends Error {}

function usage(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((c) => c.length));
  const lines = Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(width)}  ${c.summary}`);
  return `Usage: plotdown <command> [options]\n\nCommands:\n${lines.join("\n")}\n\nRun plotdown <command> --help for the options of a command.`;
}

/** Runs the command line and returns the exit code. */
export function main(argv: string[], io: CommandIo): number {
  const [name, ...args] = argv;
  if (!name || name === "-h" || name === "--help" || name === "help") {
    io.log(usage());
    return name ? 0 : 1;
  }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!command) {
    io.error(`plotdown: unknown command "${name}"\n\n${usage()}`);
    return 1;
  }
  try {
    return command.run(args, io);
  } catch (error) {
    if (error instanceof UsageError || (error as {code?: string}).code?.startsWith("ERR_PARSE_ARGS")) {
      io.error(`plotdown ${name}: ${(error as Error).message}\n\n${command.usage}`);
      return 1;
    }
    throw error;
  }
}
