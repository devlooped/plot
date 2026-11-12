/// <reference types="node" />
// The plotdown command line. Each command is an entry of COMMANDS: render
// (SVG files, or links with --link) and link.
import {parseArgs} from "node:util";
import {parseHTML} from "linkedom";
import {DEFAULT_SERVICE_URL, ImageOptionsError, MAX_LINK_LENGTH, normalizeImageOptions, type ImageFormat, type ImageLinkOptions} from "../link/index.js";
import type {StaticTheme} from "../static/index.js";
import {runLink} from "./link.js";
import {runRender} from "./render.js";

export interface CommandIo {
  cwd: string;
  log: (line: string) => void;
  error: (line: string) => void;
  env: Record<string, string | undefined>;
  /** Reads all of standard input (plotdown link reads a block from it). */
  stdin?: () => string;
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
  --link           link each image from the image service instead of writing an SVG
                   file: the block is in the URL (see plotdown link); the SVG files
                   that an earlier run wrote for the Markdown file are removed
  --png            with --link, link PNG images (theme light unless --theme dark)
  --base-url <url> with --link, the image service (default: ${DEFAULT_SERVICE_URL})
  -h, --help       show this help

Globs are resolved from the current directory and skip node_modules and .git;
quote them so that the shell does not expand them: plotdown render "**/*.md"`;

const LINK_USAGE = `Usage: plotdown link [options] [files…]

Prints the image link of a plot block: a JSON file, standard input (no file,
or -), or each block of a Markdown file, in order. The block is in the URL,
so the link needs no file and no storage:

  ${DEFAULT_SERVICE_URL}/svg/pako:eNqrVkrLz1eyUkpKLFKqBQA…

Each block is drawn first: an invalid block is reported with its line and
JSON path, as is a block whose link would pass the length limit (a link is
never truncated: commit an SVG file with plotdown render instead).

Options:
  --png            a PNG link, for Slack, Discord, email (default: SVG)
  --markdown, -m   print a Markdown image, ![alt](url), instead of the URL
  --theme <theme>  SVG: auto (default), light, dark; PNG: light (default), dark
  --scale <n>      PNG: 1 (default), 2, 3 or 4 pixels per CSS pixel
  --base-url <url> the image service (default: ${DEFAULT_SERVICE_URL}), for a service
                   you host yourself
  --max-length <n> the longest link (default: ${MAX_LINK_LENGTH} characters)
  -h, --help       show this help`;

const THEMES = new Set(["auto", "light", "dark"]);

/** The link options of the command line, checked as the service checks them. */
function linkOptions(values: {png?: boolean; theme?: string; scale?: string; "base-url"?: string; "max-length"?: string}): ImageLinkOptions {
  const format: ImageFormat = values.png ? "png" : "svg";
  if (values.theme !== undefined && !THEMES.has(values.theme)) throw new UsageError(`unknown theme "${values.theme}": use auto, light or dark`);
  // auto is the default theme of the command line; a PNG cannot follow the reader, so its default is light.
  const theme = format === "png" && values.theme === "auto" ? undefined : (values.theme as StaticTheme | undefined);
  const scale = values.scale === undefined ? undefined : Number(values.scale);
  try {
    normalizeImageOptions(format, {theme, scale});
  } catch (error) {
    if (error instanceof ImageOptionsError) throw new UsageError(error.message);
    throw error;
  }
  const baseUrl = values["base-url"];
  if (baseUrl !== undefined && !/^https?:\/\/[^/]/i.test(baseUrl)) throw new UsageError(`--base-url must be an http or https URL: ${baseUrl}`);
  const maxLength = values["max-length"] === undefined ? undefined : Number(values["max-length"]);
  if (maxLength !== undefined && !(Number.isInteger(maxLength) && maxLength > 0)) throw new UsageError(`--max-length must be a positive integer: ${values["max-length"]}`);
  return {format, theme, scale, baseUrl, maxLength};
}

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
          link: {type: "boolean", default: false},
          png: {type: "boolean", default: false},
          "base-url": {type: "string"},
          help: {type: "boolean", short: "h", default: false}
        }
      });
      if (values.help) {
        io.log(RENDER_USAGE);
        return 0;
      }
      if (!THEMES.has(values.theme)) throw new UsageError(`unknown theme "${values.theme}": use auto, light or dark`);
      if (!values.link && (values.png || values["base-url"] !== undefined)) throw new UsageError("--png and --base-url go with --link");
      if (positionals.length === 0) throw new UsageError("name the Markdown files to render, such as: plotdown render readme.md");
      const link = values.link ? linkOptions(values) : undefined;
      return runRender({
        patterns: positionals,
        cwd: io.cwd,
        outDir: values.out,
        check: values.check,
        theme: values.theme as StaticTheme,
        document: createDocument(),
        log: io.log,
        error: io.error,
        annotate: io.env.GITHUB_ACTIONS === "true",
        link
      });
    }
  },
  link: {
    summary: "print the image link of a plot block (plotdown.cc, or a service you host)",
    usage: LINK_USAGE,
    run(args, io) {
      const {values, positionals} = parseArgs({
        args,
        allowPositionals: true,
        options: {
          png: {type: "boolean", default: false},
          markdown: {type: "boolean", short: "m", default: false},
          theme: {type: "string"},
          scale: {type: "string"},
          "base-url": {type: "string"},
          "max-length": {type: "string"},
          help: {type: "boolean", short: "h", default: false}
        }
      });
      if (values.help) {
        io.log(LINK_USAGE);
        return 0;
      }
      return runLink({
        inputs: positionals,
        cwd: io.cwd,
        stdin: io.stdin,
        link: linkOptions(values),
        markdown: values.markdown,
        document: createDocument(),
        log: io.log,
        error: io.error
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
