import {request} from "node:http";
import type {Server} from "node:http";
import {Client, StreamableHTTPClientTransport} from "@modelcontextprotocol/client";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {startHttpServer} from "../src/index.js";

let server: Server;
let url: string;

beforeAll(async () => {
  ({server, url} = await startHttpServer({port: 0}));
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("streamable HTTP", () => {
  it("serves the tool", async () => {
    const client = new Client({name: "test", version: "1.0.0"});
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    const {tools} = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["render_plot"]);
    const result = await client.callTool({name: "render_plot", arguments: {plot: {marks: [{mark: "dot", data: [{a: 1}], x: "a"}]}}});
    expect(result.isError).toBeFalsy();
    await client.close();
  });

  it("refuses a Host header that is not local", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(url, {method: "POST", headers: {host: "attacker.example", "content-type": "application/json", accept: "application/json, text/event-stream"}}, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end(JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list"}));
    });
    expect(status).toBe(403);
  });

  it("answers 404 outside /mcp", async () => {
    const res = await fetch(new URL("/other", url));
    expect(res.status).toBe(404);
  });
});
