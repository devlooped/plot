/** Limits that keep a block from freezing the page or the server. */
export interface PlotdownLimits {
  /** Longest source text, in characters (UTF-16 code units). */
  maxSourceLength: number;
  /** Deepest nesting of arrays and objects in the block. */
  maxDepth: number;
  /** Most marks in the top-level marks array. */
  maxMarks: number;
  /** Most rows in one dataset (inline rows, CSV/TSV rows, fetched rows) or one channel array. */
  maxRows: number;
  /** Largest width and height, in pixels. */
  maxDimension: number;
  /** Largest number of bins or contour thresholds given as a count. */
  maxThresholds: number;
  /** Largest remote file, in characters, when remote data is allowed. */
  maxFetchLength: number;
  /** Longest wait for a remote file, in milliseconds. */
  fetchTimeout: number;
}

export const DEFAULT_LIMITS: Readonly<PlotdownLimits> = Object.freeze({
  maxSourceLength: 512 * 1024,
  maxDepth: 64,
  maxMarks: 64,
  maxRows: 100_000,
  maxDimension: 10_000,
  maxThresholds: 10_000,
  maxFetchLength: 5 * 1024 * 1024,
  fetchTimeout: 10_000
});

/** The smallest raster/contour pixelSize and hexbin/hexgrid binWidth: smaller ones mean millions of cells. */
export const MIN_PIXEL_SIZE = 0.5;
export const MIN_BIN_WIDTH = 1;

export function resolveLimits(limits?: Partial<PlotdownLimits>): PlotdownLimits {
  return {...DEFAULT_LIMITS, ...limits};
}
