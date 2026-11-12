import type {PlotdownLimits} from "@devlooped/plotdown";

/**
 * What the service accepts and draws. The limits of the block itself (rows,
 * marks, nesting, width and height) are plotdown's own defaults, but for the
 * size of the text, which the encoded and the posted limits bound first.
 */
export interface ServiceLimits {
  /** Longest encoded block in a GET path (`pako:…`), in characters. The CDN stops URLs at 14 KB before this. */
  maxEncodedLength: number;
  /** Longest block, in UTF-8 bytes: inflating a GET path stops here (no zip bomb gets further), and so does reading a POST body. */
  maxBlockBytes: number;
  /** Largest SVG the service sends, in bytes (a function answers at most 4.5 MB). */
  maxSvgBytes: number;
  /** Largest PNG, in pixels (width × height × scale²). */
  maxPngPixels: number;
  /** Longest side of a PNG, in pixels. */
  maxPngSide: number;
  /** Longest render (the chart, then the PNG), in milliseconds; past it the render is stopped. */
  renderTimeout: number;
  /** Renders waiting for the renderer of one instance; more are refused with 503. */
  maxQueue: number;
}

export const DEFAULT_SERVICE_LIMITS: Readonly<ServiceLimits> = Object.freeze({
  maxEncodedLength: 16 * 1024,
  maxBlockBytes: 256 * 1024,
  maxSvgBytes: 4_000_000,
  maxPngPixels: 4096 * 4096,
  maxPngSide: 8192,
  renderTimeout: 5_000,
  maxQueue: 16
});

/** The limits of plotdown under the service's limits. */
export function plotdownLimits(limits: ServiceLimits): Partial<PlotdownLimits> {
  return {maxSourceLength: limits.maxBlockBytes};
}
