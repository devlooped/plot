import {readFileSync} from "node:fs";
import {Client} from "@modelcontextprotocol/client";
import {EXTENSION_ID, RESOURCE_MIME_TYPE} from "@modelcontextprotocol/ext-apps/server";
import {InMemoryTransport} from "@modelcontextprotocol/server";
import {afterEach, describe, expect, it} from "vitest";
import {parseImageLink} from "@devlooped/plotdown/link";
import {createServer, SCHEMA_URI, SPEC_URI, VIEW_URI, type CreateServerOptions} from "../src/index.js";
import {toSourceText} from "../src/source.js";

const bar = {
  title: "Penguins",
  data: {penguins: {csv: "species,mass\nAdelie,3750\nGentoo,5000\n"}},
  marks: [
    {mark: "barY", data: "penguins", x: "species", y: "mass", fill: "species"},
    {mark: "ruleY", data: [0]}
  ]
};

const open: Client[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

/** Connects an in-memory client; `apps` says whether it advertises MCP Apps support. */
async function connect(apps = true, options: CreateServerOptions = {}): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(options).connect(serverTransport);
  const client = new Client(
    {name: "test", version: "1.0.0"},
    {capabilities: apps ? {extensions: {[EXTENSION_ID]: {mimeTypes: [RESOURCE_MIME_TYPE]}}} : {}}
  );
  await client.connect(clientTransport);
  open.push(client);
  return client;
}

const text = (result: {content?: unknown}) =>
  ((result.content ?? []) as {type: string; text?: string}[]).map((c) => c.text ?? "").join("\n");

describe("render_plot", () => {
  it("is listed with its view and a description of the format", async () => {
    const client = await connect();
    const {tools} = await client.listTools();
    const tool = tools.find((t) => t.name === "render_plot");
    expect(tool).toBeDefined();
    expect(tool!._meta?.ui).toMatchObject({resourceUri: VIEW_URI});
    expect(tool!._meta?.["ui/resourceUri"]).toBe(VIEW_URI);
    expect(tool!.description).toContain('"marks"');
    expect(tool!.description).toContain(SPEC_URI);
    expect(tool!.inputSchema.required).toEqual(["plot"]);
    expect(tool!.annotations?.readOnlyHint).toBe(true);
  });

  it("returns the view for a valid block, given as an object", async () => {
    const client = await connect();
    const {tools} = await client.listTools();
    const result = await client.callTool({name: "render_plot", arguments: {plot: bar}});
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ok: true});
    expect(text(result)).toContain('Chart "Penguins" with 2 marks (barY, ruleY)');
    expect(text(result)).toContain("shown to the user");

    // The host follows the tool's resourceUri to the view.
    const uri = (tools.find((t) => t.name === "render_plot")!._meta!.ui as {resourceUri: string}).resourceUri;
    const view = await client.readResource({uri});
    const content = view.contents[0] as {uri: string; mimeType: string; text: string; _meta?: Record<string, unknown>};
    expect(content.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(content.text).toMatch(/^<!doctype html>/);
    expect(content._meta?.ui).toMatchObject({prefersBorder: true});
  });

  it("accepts the block as text, inside a Markdown fence", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "render_plot",
      arguments: {plot: "```plot\n" + JSON.stringify(bar, null, 2) + "\n```"}
    });
    expect(result.isError).toBeFalsy();
  });

  it("returns an error with the JSON path for an invalid block", async () => {
    const client = await connect();
    const invalid = {...bar, marks: [{mark: "barY", data: "penguins", x: "species", y: "mass", transform: [{binX: {y: "average"}}]}]};
    const result = await client.callTool({name: "render_plot", arguments: {plot: invalid}});
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/^Invalid plot block at \$\.marks\[0\]\.transform\[0\]\.binX\.y: /);
    expect(text(result)).toContain("call render_plot again");
    expect(result.structuredContent).toMatchObject({ok: false, error: {path: "$.marks[0].transform[0].binX.y"}});
  });

  it("reports an unknown mark at its path", async () => {
    const client = await connect();
    const result = await client.callTool({name: "render_plot", arguments: {plot: {marks: [{mark: "bars", data: [1]}]}}});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({error: {path: "$.marks[0].mark"}});
  });

  it("reports JSON syntax errors with a line and a column", async () => {
    const client = await connect();
    const result = await client.callTool({name: "render_plot", arguments: {plot: '{\n  "marks": []\n} x'}});
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/at \$ \(line 3, column \d+\): invalid JSON/);
  });

  it("reports what only Plot rejects, from a server-side render", async () => {
    const client = await connect();
    const plot = {marks: [{mark: "line", data: [{a: 1}, {a: 2}], x: "a", y: "a", curve: "bogus"}]};
    const result = await client.callTool({name: "render_plot", arguments: {plot}});
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("unknown curve");
  });

  it("refuses remote data", async () => {
    const client = await connect();
    const plot = {marks: [{mark: "dot", data: {url: "https://example.com/data.csv"}, x: "a", y: "b"}]};
    const result = await client.callTool({name: "render_plot", arguments: {plot}});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({error: {path: expect.stringMatching(/^\$\.marks\[0\]\.data/)}});
  });

  it("gives hosts without MCP Apps the chart as a PNG drawn locally, and the block as text", async () => {
    const client = await connect(false);
    const result = await client.callTool({name: "render_plot", arguments: {plot: bar}});
    expect(result.isError).toBeFalsy();
    const content = result.content as {type: string; mimeType?: string; data?: string; text?: string}[];
    expect(content.map((c) => c.type)).toEqual(["image", "text"]);
    const png = Buffer.from(content[0]!.data!, "base64");
    expect(content[0]!.mimeType).toBe("image/png");
    expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    // Drawn at scale 2: twice Plot's default width of 640 and the static SVG's padding of 8 a side.
    expect(png.readUInt32BE(16)).toBe(2 * (640 + 2 * 8));
    expect(text(result)).toContain("attached as an image");
    expect(text(result)).toContain("```plot\n{");
    // No link by default: it would send the block to plotdown.cc.
    expect(text(result)).not.toContain("plotdown.cc");
  });

  it("adds a plotdown.cc image link when asked to", async () => {
    const client = await connect(false, {imageLinks: true});
    const result = await client.callTool({name: "render_plot", arguments: {plot: bar}});
    const link = /!\[Penguins\]\((https:\/\/plotdown\.cc\/png\/pako:[\w-]+\?scale=2)\)/.exec(text(result));
    expect(link).not.toBeNull();
    expect(parseImageLink(link![1]!).block).toBe(JSON.stringify(bar, null, 2));
  });

  it("draws a raster mark in the image, and gives the text alone for a chart too large for a PNG", async () => {
    const client = await connect(false);
    const raster = {marks: [{mark: "raster", data: [{x: 0, y: 0, v: 1}, {x: 1, y: 1, v: 2}], x: "x", y: "y", fill: "v"}]};
    const drawn = await client.callTool({name: "render_plot", arguments: {plot: raster}});
    expect((drawn.content as {type: string}[]).map((c) => c.type)).toEqual(["image", "text"]);
    const huge = await client.callTool({name: "render_plot", arguments: {plot: {width: 5000, marks: [{mark: "ruleY", data: [0]}]}}});
    expect(huge.isError).toBeFalsy();
    expect((huge.content as {type: string}[]).map((c) => c.type)).toEqual(["text"]);
    expect(text(huge)).toContain("could not be drawn as an image");
  });
});

describe("resources", () => {
  it("lists the view, the spec and the schema", async () => {
    const client = await connect();
    const {resources} = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual([SCHEMA_URI, SPEC_URI, VIEW_URI].sort());
  });

  it("serves the spec and the schema", async () => {
    const client = await connect();
    const spec = (await client.readResource({uri: SPEC_URI})).contents[0] as {text: string; mimeType: string};
    expect(spec.mimeType).toBe("text/markdown");
    expect(spec.text).toContain("# The plotdown block");
    const schema = (await client.readResource({uri: SCHEMA_URI})).contents[0] as {text: string};
    expect(JSON.parse(schema.text).$id).toMatch(/plot\.schema\.json$/);
  });
});

describe("view", () => {
  const html = readFileSync(new URL("../dist/view.html", import.meta.url), "utf8");

  it("is one self-contained file that loads nothing from the network", () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    expect(style).not.toMatch(/@import|url\(/);
    expect(html.match(/<script/gi)).toHaveLength(1);
  });

  it("bundles the core and the ext-apps client", () => {
    expect(html).toContain("ui/initialize");
    expect(html).toContain("PlotdownError");
  });
});

describe("toSourceText", () => {
  it("strips plot, oplot and json fences and keeps other text", () => {
    expect(toSourceText('```oplot\n{"marks":[]}\n```')).toBe('{"marks":[]}');
    expect(toSourceText('~~~json\n{"marks":[]}\n~~~\n')).toBe('{"marks":[]}');
    expect(toSourceText('```python\n{"marks":[]}\n```')).toBe('```python\n{"marks":[]}\n```');
    expect(toSourceText({marks: []})).toBe('{\n  "marks": []\n}');
  });
});
