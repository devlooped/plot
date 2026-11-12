// ============================================================================
// STATIC IMAGE FALLBACK, for hosts that do not render MCP Apps views (no
// "io.modelcontextprotocol/ui" extension in the client capabilities): they only
// see the content blocks of the tool result.
//
// What such a host gets:
//
// 1. The chart as a PNG image block, drawn here, on the user's machine: the
//    standalone SVG of @devlooped/plotdown/static, rasterized with resvg and
//    the Liberation Sans fonts of this package (the widths the SVG estimates its
//    text with, the fonts of the plotdown.cc service). PNG, not SVG: the chat
//    hosts and model APIs take PNG, JPEG, GIF and WebP images, and refuse SVG.
//    Light colors: a PNG cannot follow the host's theme, and a white chart
//    reads on a light and a dark conversation alike.
// 2. Text: a summary, and the block as a Markdown fence, which any page or
//    editor with plotdown renders, and which the model can quote in its answer.
// 3. Only with the imageLinks option: a Markdown image whose URL is
//    https://plotdown.cc/png/pako:…, for hosts that show images of the model's
//    Markdown answer but not those of tool results. It is off by default: the
//    link holds the block, so the data of the chart would leave the machine,
//    in the request of whoever opens it, which nothing else here does.
//
// When the image cannot be drawn (resvg has no binary for the platform, or the
// chart is too large), the result is the text alone.
// ============================================================================
import {fileURLToPath} from "node:url";
import {imageLink, LinkTooLongError, markdownImage} from "@devlooped/plotdown/link";
import {renderStatic} from "@devlooped/plotdown/static";
import type {ContentBlock} from "@modelcontextprotocol/server";
import {parseHTML} from "linkedom";
import {describePlot} from "./describe.js";
import {toFence} from "./source.js";

export interface FallbackInput {
  /** The text of the block, as validated. */
  text: string;
  /** The block parsed as JSON. */
  json: Record<string, unknown>;
}

export interface FallbackOptions {
  /** Also give a plotdown.cc image link (it holds the block). Default false. */
  imageLinks?: boolean;
}

/** Device pixels per CSS pixel of the PNG: sharp on high-density screens. */
export const PNG_SCALE = 2;
/** The largest PNG, in pixels a side; a larger chart is drawn at scale 1, or not at all. */
export const MAX_PNG_SIDE = 4096;

/** Content for hosts without MCP Apps: the chart as a PNG, and the block as text. */
export async function staticFallback(input: FallbackInput, options: FallbackOptions = {}): Promise<ContentBlock[]> {
  const png = await drawPng(input.text);
  const lines = [
    describePlot(input.json),
    png
      ? "This host does not show MCP Apps views: the chart is attached as an image."
      : "This host does not show MCP Apps views, and the chart could not be drawn as an image here.",
    "In a Markdown document, the block below renders as the chart wherever plotdown is installed:",
    "",
    toFence(input.text)
  ];
  const link = options.imageLinks ? pngLink(input.text, png?.alt ?? "Chart") : undefined;
  if (link) lines.push("", "As an image link, drawn by plotdown.cc (the link holds the block):", "", link);
  const content: ContentBlock[] = [];
  if (png) content.push({type: "image", mimeType: "image/png", data: png.base64});
  content.push({type: "text", text: lines.join("\n")});
  return content;
}

interface Png {
  base64: string;
  alt: string;
}

type ResvgModule = typeof import("@resvg/resvg-js");
let resvg: Promise<ResvgModule | undefined> | undefined;

/** resvg, loaded on first use; undefined when its binary does not run here. */
function loadResvg(): Promise<ResvgModule | undefined> {
  return (resvg ??= import("@resvg/resvg-js").catch(() => undefined));
}

/** The Liberation Sans fonts: ../fonts from src/ and from dist/ alike. */
const FONT_FILES = ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf"].map((name) => fileURLToPath(new URL(`../fonts/${name}`, import.meta.url)));
const FONT_FAMILY = "Liberation Sans";

/** Draws the block as a PNG; undefined when it cannot be drawn here. */
export async function drawPng(text: string): Promise<Png | undefined> {
  const module = await loadResvg();
  if (!module) return undefined;
  try {
    const {document} = parseHTML("<!doctype html><html><head></head><body></body></html>");
    const chart = renderStatic(text, {document: document as unknown as Document, theme: "light"});
    const largest = Math.max(chart.width, chart.height);
    const scale = largest * PNG_SCALE <= MAX_PNG_SIDE ? PNG_SCALE : largest <= MAX_PNG_SIDE ? 1 : 0;
    if (!scale) return undefined;
    const image = new module.Resvg(chart.svg, {
      fitTo: {mode: "zoom", value: scale},
      font: {
        loadSystemFonts: false,
        fontFiles: FONT_FILES,
        defaultFontFamily: FONT_FAMILY,
        sansSerifFamily: FONT_FAMILY,
        serifFamily: FONT_FAMILY,
        monospaceFamily: FONT_FAMILY
      },
      logLevel: "off"
    });
    return {base64: Buffer.from(image.render().asPng()).toString("base64"), alt: chart.alt};
  } catch {
    return undefined;
  }
}

/** A Markdown image of the block from plotdown.cc; undefined when the block does not fit in a link. */
function pngLink(text: string, alt: string): string | undefined {
  try {
    return markdownImage(imageLink(text, {format: "png", scale: PNG_SCALE}), alt);
  } catch (error) {
    if (error instanceof LinkTooLongError) return undefined;
    throw error;
  }
}
