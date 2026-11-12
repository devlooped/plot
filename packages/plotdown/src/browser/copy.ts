// The Copy menu of a chart: its block as JSON, or the chart as a standalone SVG
// or a PNG. The images come from the static renderer, so they hold the title,
// legends and caption, carry their own colors, and load nothing.
import {renderStatic, type StaticChart} from "../static/index.js";
import type {Scheme} from "./theme.js";

export type CopyFormat = "json" | "png" | "svg";

/** The formats of the menu, in its order, with their labels. */
export const COPY_FORMATS: readonly {format: CopyFormat; label: string}[] = [
  {format: "json", label: "JSON"},
  {format: "png", label: "PNG"},
  {format: "svg", label: "SVG"}
];

/** The standalone SVG of a block, in the colors of a scheme. */
export function chartImage(text: string, scheme: Scheme, document: Document): StaticChart {
  return renderStatic(text, {document, theme: scheme});
}

/**
 * Copies a block, or its chart, to the clipboard. The clipboard call is made
 * before the first await, while the click that asked for it still counts as a
 * user gesture (Safari and Firefox require it).
 */
export function copyBlock(format: CopyFormat, text: string, scheme: Scheme, document: Document): Promise<void> {
  const view = document.defaultView;
  const clipboard = view?.navigator.clipboard;
  if (!view || !clipboard) return Promise.reject(new Error("the clipboard is not available here"));
  if (format === "json") return clipboard.writeText(text.trim() + "\n");
  const chart = chartImage(text, scheme, document);
  if (format === "svg") return clipboard.writeText(chart.svg);
  const Item = (view as Window & {ClipboardItem?: typeof ClipboardItem}).ClipboardItem;
  if (!Item || typeof clipboard.write !== "function") return Promise.reject(new Error("this browser cannot copy images"));
  return clipboard.write([new Item({"image/png": rasterize(chart, document)})]);
}

/** Draws a standalone SVG on a canvas, at the screen's density and at least twice its size. */
async function rasterize(chart: StaticChart, document: Document): Promise<Blob> {
  const view = document.defaultView!;
  const scale = Math.max(2, Math.ceil(view.devicePixelRatio || 1));
  const image = new view.Image(chart.width, chart.height);
  // A data: URL, not a blob: one: more pages' Content-Security-Policy allow it for images.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(chart.width * scale);
  canvas.height = Math.round(chart.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("the browser cannot draw the image");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the browser cannot encode the image"))), "image/png"));
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** The icons of the Copy button: built as elements, so that a page enforcing Trusted Types accepts them. */
const ICONS = {
  copy: ["M5 5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 5 11.5z", "M11 4V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"],
  done: ["M3 8.5l3.2 3L13 4.5"],
  failed: ["M4 4l8 8", "M12 4l-8 8"]
} as const;

export type IconName = keyof typeof ICONS;

export function icon(document: Document, name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.4");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
