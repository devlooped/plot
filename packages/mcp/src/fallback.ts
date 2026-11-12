// ============================================================================
// STATIC IMAGE FALLBACK: the one place where a static image plugs in.
//
// Hosts that do not render MCP Apps views (no "io.modelcontextprotocol/ui"
// extension in the client capabilities) only see the content blocks of the
// tool result. This function builds those blocks for a block that is valid.
//
// Today it returns text: a summary and the block as a Markdown fence, which a
// host with a plotdown renderer (extension, script tag, editor plugin) shows
// as a chart. When `@devlooped/plotdown/static` (the standalone-SVG renderer)
// is available, render the block here and return an image block as well, e.g.:
//
//   import {renderSvg} from "@devlooped/plotdown/static";   // name to confirm
//   const svg = renderSvg(text);
//   return [{type: "image", mimeType: "image/svg+xml", data: base64(svg)}, ...text];
//
// Many chat hosts only show PNG; rasterizing (resvg-js or similar) also goes
// here. Nothing else in the server needs to change.
// ============================================================================
import type {ContentBlock} from "@modelcontextprotocol/server";
import {describePlot} from "./describe.js";
import {toFence} from "./source.js";

export interface FallbackInput {
  /** The text of the block, as validated. */
  text: string;
  /** The block parsed as JSON. */
  json: Record<string, unknown>;
}

/** Content for hosts without MCP Apps: text for now, an image once the static renderer exists. */
export async function staticFallback(input: FallbackInput): Promise<ContentBlock[]> {
  return [
    {
      type: "text",
      text:
        `${describePlot(input.json)} This host does not show MCP Apps views, so the chart is not drawn here. ` +
        "Put the block below in a Markdown document to render it with plotdown:\n\n" +
        toFence(input.text)
    }
  ];
}
