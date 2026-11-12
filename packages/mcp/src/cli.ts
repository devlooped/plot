#!/usr/bin/env node
// plotdown-mcp: stdio by default; --http [--port N] [--host H] for streamable HTTP;
// --image-links adds plotdown.cc links to the image of hosts without MCP Apps.
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {createServer, VERSION} from "./server.js";
import {startHttpServer} from "./http.js";

const args = process.argv.slice(2);
const imageLinks = args.includes("--image-links");
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`plotdown-mcp ${VERSION}: MCP App server that draws plotdown blocks

Usage:
  plotdown-mcp                       serve over stdio (default)
  plotdown-mcp --http [--port 3001] [--host 127.0.0.1]
                                     serve over streamable HTTP at /mcp
  --image-links                      hosts without MCP Apps also get a
                                     plotdown.cc link (it holds the block)
`);
} else if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(VERSION + "\n");
} else if (args.includes("--http")) {
  const port = Number(option("--port") ?? process.env.PORT ?? 3001);
  const {url} = await startHttpServer({port, host: option("--host") ?? "127.0.0.1", imageLinks});
  console.error(`plotdown-mcp listening on ${url}`);
} else {
  serveStdio(() => createServer({imageLinks}));
}
