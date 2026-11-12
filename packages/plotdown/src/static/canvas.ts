// A minimal 2D canvas, enough for what Plot draws on one: the raster mark
// (createImageData, putImageData), its color converter (fillRect then
// getImageData of one pixel) and the ramp of continuous legends (fillStyle or
// globalAlpha, then fillRect). toDataURL gives a PNG made by our own encoder,
// so the bytes are the same in every environment: jsdom, linkedom, a browser.
import {color as parseColor} from "d3-color";
import {base64, encodePng} from "./png.js";

interface ImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

type Rgba = [number, number, number, number];

function toRgba(value: unknown): Rgba | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = parseColor(value);
  if (!parsed) return undefined;
  const {r, g, b, opacity} = parsed.rgb();
  return [r, g, b, Number.isFinite(opacity) ? opacity : 1];
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** The 2D context of a StaticCanvas. Other drawing calls are accepted and do nothing. */
export class StaticContext2D {
  globalAlpha = 1;
  private fill: Rgba = [0, 0, 0, 1];
  private fillText = "#000000";

  constructor(readonly canvas: StaticCanvas) {}

  get fillStyle(): string {
    return this.fillText;
  }

  set fillStyle(value: string) {
    const rgba = toRgba(value);
    if (rgba) {
      this.fill = rgba;
      this.fillText = value;
    }
  }

  createImageData(width: number, height: number): ImageDataLike {
    return {width, height, data: new Uint8ClampedArray(Math.max(0, width * height * 4))};
  }

  getImageData(x: number, y: number, width: number, height: number): ImageDataLike {
    const image = this.createImageData(width, height);
    const {pixels, width: cw, height: ch} = this.canvas;
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const sx = x + i;
        const sy = y + j;
        if (sx < 0 || sy < 0 || sx >= cw || sy >= ch) continue;
        const s = (sy * cw + sx) * 4;
        const d = (j * width + i) * 4;
        for (let k = 0; k < 4; k++) image.data[d + k] = pixels[s + k]!;
      }
    }
    return image;
  }

  putImageData(image: ImageDataLike, x: number, y: number): void {
    const {pixels, width: cw, height: ch} = this.canvas;
    for (let j = 0; j < image.height; j++) {
      for (let i = 0; i < image.width; i++) {
        const dx = x + i;
        const dy = y + j;
        if (dx < 0 || dy < 0 || dx >= cw || dy >= ch) continue;
        const s = (j * image.width + i) * 4;
        const d = (dy * cw + dx) * 4;
        for (let k = 0; k < 4; k++) pixels[d + k] = image.data[s + k]!;
      }
    }
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    this.eachPixel(x, y, width, height, (d, pixels) => pixels.fill(0, d, d + 4));
  }

  /** Fills whole pixels (the rectangles Plot draws are pixel-aligned), source-over. */
  fillRect(x: number, y: number, width: number, height: number): void {
    const [r, g, b, a0] = this.fill;
    const a = a0 * Math.max(0, Math.min(1, this.globalAlpha));
    this.eachPixel(x, y, width, height, (d, pixels) => {
      const da = pixels[d + 3]! / 255;
      const oa = a + da * (1 - a);
      if (oa === 0) return pixels.fill(0, d, d + 4);
      pixels[d] = clamp((r * a + pixels[d]! * da * (1 - a)) / oa);
      pixels[d + 1] = clamp((g * a + pixels[d + 1]! * da * (1 - a)) / oa);
      pixels[d + 2] = clamp((b * a + pixels[d + 2]! * da * (1 - a)) / oa);
      pixels[d + 3] = clamp(oa * 255);
    });
  }

  private eachPixel(x: number, y: number, width: number, height: number, f: (offset: number, pixels: Uint8ClampedArray) => void): void {
    const {pixels, width: cw, height: ch} = this.canvas;
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(cw, Math.round(x + width));
    const y1 = Math.min(ch, Math.round(y + height));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) f((j * cw + i) * 4, pixels);
  }
}

/** A canvas element stand-in with a 2D context and a PNG toDataURL. */
export class StaticCanvas {
  private w = 300;
  private h = 150;
  pixels = new Uint8ClampedArray(this.w * this.h * 4);
  private context?: StaticContext2D;

  get width(): number {
    return this.w;
  }

  set width(value: number) {
    this.w = Math.max(0, Math.floor(value));
    this.pixels = new Uint8ClampedArray(this.w * this.h * 4);
  }

  get height(): number {
    return this.h;
  }

  set height(value: number) {
    this.h = Math.max(0, Math.floor(value));
    this.pixels = new Uint8ClampedArray(this.w * this.h * 4);
  }

  getContext(type: string): StaticContext2D | null {
    if (type !== "2d") return null;
    return (this.context ??= new StaticContext2D(this));
  }

  toDataURL(): string {
    if (this.w === 0 || this.h === 0) return "data:,";
    return `data:image/png;base64,${base64(encodePng(this.w, this.h, this.pixels))}`;
  }
}

/**
 * A view of a document whose createElement("canvas") gives a StaticCanvas, and
 * which is otherwise the document itself (methods are bound to it, so that the
 * DOM implementation's own checks pass).
 */
export function withStaticCanvas(document: Document): Document {
  return new Proxy(document, {
    get(target, key) {
      if (key === "createElement") {
        return (name: string, options?: ElementCreationOptions) =>
          String(name).toLowerCase() === "canvas" ? new StaticCanvas() : target.createElement(name, options);
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
  });
}
