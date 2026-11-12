// Streamable HTTP transport on node:http, through the SDK's web-standard handler.
import {createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse} from "node:http";
import {Readable} from "node:stream";
import {createMcpHandler, hostHeaderValidationResponse, localhostAllowedHostnames} from "@modelcontextprotocol/server";
import {createServer} from "./server.js";

export interface HttpServerOptions {
  /** Port to listen on. Default 3001; 0 picks a free one. */
  port?: number;
  /** Interface to bind. Default 127.0.0.1. */
  host?: string;
  /** Path of the MCP endpoint. Default /mcp. */
  path?: string;
}

/** Serves the plotdown MCP server over streamable HTTP; resolves once it listens. */
export async function startHttpServer(options: HttpServerOptions = {}): Promise<{server: Server; url: string}> {
  const host = options.host ?? "127.0.0.1";
  const path = options.path ?? "/mcp";
  const local = ["127.0.0.1", "localhost", "::1"].includes(host);
  const handler = createMcpHandler(() => createServer(), {onerror: (e) => console.error("plotdown-mcp:", e.message)});

  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== path) {
        res.writeHead(404, {"content-type": "text/plain"}).end("Not found. The MCP endpoint is " + path);
        return;
      }
      const request = toRequest(req);
      // DNS rebinding protection when bound to the loopback interface.
      const rejected = local ? hostHeaderValidationResponse(request, localhostAllowedHostnames()) : undefined;
      await send(rejected ?? (await handler.fetch(request)), res);
    } catch (error) {
      console.error("plotdown-mcp:", error);
      if (!res.headersSent) res.writeHead(500, {"content-type": "application/json"});
      res.end(JSON.stringify({jsonrpc: "2.0", error: {code: -32603, message: "Internal server error"}, id: null}));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 3001, host, resolve);
  });
  server.on("close", () => void handler.close());
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const shown = host.includes(":") ? `[${host}]` : host;
  return {server, url: `http://${shown}:${port}${path}`};
}

function toRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value !== undefined) headers.set(key, value);
  }
  const controller = new AbortController();
  req.once("close", () => {
    if (!req.complete) controller.abort();
  });
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`), {
    method: req.method ?? "GET",
    headers,
    signal: controller.signal,
    ...(hasBody ? {body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: "half"} : {})
  } as RequestInit);
}

async function send(response: Response, res: ServerResponse): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  res.once("close", () => void reader.cancel().catch(() => {}));
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}
