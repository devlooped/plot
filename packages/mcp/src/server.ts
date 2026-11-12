import {PlotdownError, render, validate} from "@devlooped/plotdown";
import {getUiCapability, registerAppResource, registerAppTool, RESOURCE_MIME_TYPE} from "@modelcontextprotocol/ext-apps/server";
import {McpServer, type CallToolResult, type ContentBlock} from "@modelcontextprotocol/server";
import {parseHTML} from "linkedom";
import {z} from "zod";
import {readAsset} from "./assets.js";
import {describePlot} from "./describe.js";
import {staticFallback} from "./fallback.js";
import {toSourceText, type PlotInput} from "./source.js";

export const VERSION = "0.1.0";
/** The MCP Apps view that draws the chart. */
export const VIEW_URI = "ui://plotdown/view.html";
/** The format of a plot block (spec/spec.md), as Markdown. */
export const SPEC_URI = "plotdown://spec";
/** The JSON Schema of a plot block. */
export const SCHEMA_URI = "plotdown://schema";

export const TOOL_DESCRIPTION = `Draw a chart and show it to the user. The input is a plotdown block: strict JSON holding the options of Observable Plot's Plot.plot(), with marks and transforms written as data instead of function calls.

Example (a histogram):
{"title": "Body mass", "data": {"penguins": {"csv": "species,mass\\nAdelie,3750\\nGentoo,5000\\n"}},
 "y": {"grid": true}, "color": {"legend": true},
 "marks": [{"mark": "rectY", "data": "penguins", "x": "mass", "fill": "species", "transform": [{"binX": {"y": "count"}}]},
           {"mark": "ruleY", "data": [0]}]}

Rules:
- "marks" is required: an array of {"mark": <Plot mark name>, "data": ..., ...options of that mark}. Marks: dot, line, lineY, lineX, barY, barX, rectY, rectX, areaY, areaX, ruleX, ruleY, text, tickX, tickY, cell, frame, tip, link, arrow, boxX, boxY, image, geo, density, contour, hexgrid, waffleY, waffleX, linearRegressionY, auto, and the other Plot marks.
- "data" of a mark: inline rows ([{"x": 1, "y": 2}]), a name from the top-level "data" map, {"csv": "header\\nrows"} or {"tsv": ...}. Network URLs are not allowed: put the data inline.
- Channels (x, y, fill, stroke, r, text, title, fx, fy...) are field names (strings), constants, or arrays. A CSS color string ("steelblue") for fill/stroke is a constant.
- Transforms: "transform": [{"<name>": <first argument of Plot.<name>>}], applied in order (innermost first): binX, binY, groupX, groupY, stackY, windowY, normalizeY, mapY, dodgeY, hexbin, select, filter, sort, shiftX, pointerX...
- Reducers, curves, schemes, intervals and formats are names ("count", "mean", "catmull-rom", "blues", "month", "%b %Y").
- Top-level keys are Plot.plot() options: title, subtitle, caption, width, height, margin*, x, y, color, fx, fy, facet, projection, grid...
- Dates are ISO 8601 strings. No functions, no JavaScript, no unknown keys.

An invalid block returns an error naming the JSON path of the bad value (such as $.marks[0].transform[0].binX.y): fix that value and call again. The complete format is the resource ${SPEC_URI}; the JSON Schema is ${SCHEMA_URI}.`;

const inputSchema = z.object({
  plot: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .describe("The plot block: a JSON object, or its JSON text (a ```plot Markdown fence around the text is accepted).")
});

export interface CreateServerOptions {
  /**
   * Also render the block on the server (with linkedom) to catch what only Plot
   * rejects, such as an unknown curve or scale type. Default true.
   */
  checkRender?: boolean;
  /**
   * For hosts without MCP Apps, also give a plotdown.cc image link of the chart,
   * beside the PNG drawn locally. The link holds the block, so the chart's data
   * leaves the machine when the link is opened. Default false.
   */
  imageLinks?: boolean;
}

/** Creates the plotdown MCP server: the render_plot tool, its view, and the spec and schema resources. */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const checkRender = options.checkRender ?? true;
  const server = new McpServer(
    {name: "plotdown", title: "plotdown", version: VERSION},
    {
      instructions:
        "plotdown draws charts from plot blocks (Observable Plot options as strict JSON). Call render_plot to show a chart; " +
        `read ${SPEC_URI} for the full format. The same block, in a \`\`\`plot Markdown fence, renders wherever plotdown is installed.`
    }
  );

  registerAppTool(
    server,
    "render_plot",
    {
      title: "Render a plot",
      description: TOOL_DESCRIPTION,
      inputSchema,
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      _meta: {ui: {resourceUri: VIEW_URI}}
    },
    async ({plot}): Promise<CallToolResult> => {
      const checked = check(plot as PlotInput, checkRender);
      if (!checked.ok) return checked.result;
      const summary = describePlot(checked.json);
      const ui = getUiCapability(server.server.getClientCapabilities());
      const content: ContentBlock[] = ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE)
        ? [{type: "text", text: `${summary} The chart is shown to the user.`}]
        : await staticFallback({text: checked.text, json: checked.json}, {imageLinks: options.imageLinks ?? false});
      return {content, structuredContent: {ok: true, summary}};
    }
  );

  registerAppResource(
    server,
    "plotdown chart view",
    VIEW_URI,
    {description: "Draws the chart of a render_plot call, in the host's theme, with its source.", mimeType: RESOURCE_MIME_TYPE},
    async () => ({
      contents: [
        {
          uri: VIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: readAsset("view.html"),
          _meta: {ui: {prefersBorder: true, permissions: {clipboardWrite: {}}}}
        }
      ]
    })
  );

  server.registerResource(
    "plotdown spec",
    SPEC_URI,
    {title: "The plotdown block format", description: "The complete format of a plot block: marks, channels, transforms, data, options, errors.", mimeType: "text/markdown"},
    async (uri) => ({contents: [{uri: uri.href, mimeType: "text/markdown", text: readAsset("spec.md")}]})
  );

  server.registerResource(
    "plotdown schema",
    SCHEMA_URI,
    {title: "The JSON Schema of a plot block", description: "JSON Schema 2020-12 of a plot block, per mark and transform.", mimeType: "application/schema+json"},
    async (uri) => ({contents: [{uri: uri.href, mimeType: "application/schema+json", text: readAsset("plot.schema.json")}]})
  );

  return server;
}

type Checked = {ok: true; text: string; json: Record<string, unknown>} | {ok: false; result: CallToolResult};

function check(plot: PlotInput, checkRender: boolean): Checked {
  const text = toSourceText(plot);
  try {
    validate(text);
    const json = JSON.parse(text) as Record<string, unknown>;
    // The raster mark needs a canvas, which linkedom does not have.
    if (checkRender && !usesMark(json, "raster")) {
      render(text, {document: parseHTML("<!doctype html><html><body></body></html>").document as unknown as Document});
    }
    return {ok: true, text, json};
  } catch (error) {
    return {ok: false, result: errorResult(error)};
  }
}

function usesMark(json: Record<string, unknown>, name: string): boolean {
  return Array.isArray(json.marks) && json.marks.some((m) => (m as {mark?: unknown})?.mark === name);
}

/** The tool error the model reads to fix its block. */
export function errorResult(error: unknown): CallToolResult {
  const e =
    error instanceof PlotdownError
      ? {path: error.path, message: error.message, line: error.line, column: error.column}
      : {path: "$", message: error instanceof Error ? error.message : String(error)};
  const where = e.line !== undefined ? ` (line ${e.line}, column ${e.column})` : "";
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Invalid plot block at ${e.path}${where}: ${e.message}\nFix the value at ${e.path} and call render_plot again. The format is in the resource ${SPEC_URI}.`
      }
    ],
    structuredContent: {ok: false, error: e}
  };
}
