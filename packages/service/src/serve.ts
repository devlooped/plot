/// <reference types="node" />
// A local server for the service, for people who host it themselves or try it
// without Vercel: `node dist/serve.js [port]` (8787 by default), or PORT=….
import http from "node:http";
import {createNodeService} from "./node.js";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const {handle} = createNodeService();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${port}`}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? (req as unknown as ReadableStream) : undefined,
      // @ts-expect-error Node's fetch needs duplex for a streamed body
      duplex: hasBody ? "half" : undefined
    });
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  } catch (error) {
    console.error(error);
    res.writeHead(500).end();
  }
});

server.listen(port, () => console.log(`plotdown service on http://localhost:${port} (try /api/health)`));
