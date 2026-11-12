import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {JSDOM} from "jsdom";

export const specDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../spec");
export const fixturesDir = path.join(specDir, "fixtures");

export function fixtureNames(): string[] {
  return fs
    .readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
}

export function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, `${name}.json`), "utf8");
}

/**
 * A jsdom document. jsdom has no canvas, which the raster mark needs: a minimal
 * 2D context stands in, so both sides of a comparison draw the same placeholder.
 */
export function createDocument(): Document {
  const {window} = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const canvas = window.HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  canvas.getContext = function () {
    const context: Record<string, unknown> = {
      createImageData: (width: number, height: number) => ({width, height, data: new Uint8ClampedArray(width * height * 4)}),
      getImageData: (_x: number, _y: number, width: number, height: number) => ({width, height, data: new Uint8ClampedArray(width * height * 4)})
    };
    // Any other drawing call (clearRect, putImageData, drawImage, …) does nothing.
    return new Proxy(context, {get: (target, key) => (key in target ? target[key as string] : () => {})});
  };
  canvas.toDataURL = function (this: HTMLCanvasElement) {
    return `data:image/png;base64,${this.width}x${this.height}`;
  };
  return window.document;
}

/** The markup of an element, with Plot's generated ids (clip paths, markers, patterns) numbered from 0. */
export function markup(element: Element): string {
  const html = element.outerHTML;
  const ids = new Map<string, string>();
  return html.replace(/\bplot-[a-z]+-\d+\b/g, (id) => {
    if (!ids.has(id)) ids.set(id, `plot-id-${ids.size}`);
    return ids.get(id)!;
  });
}
