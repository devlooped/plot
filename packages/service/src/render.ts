// One render: a block's text to the bytes of an SVG or a PNG, or the reason it
// cannot be drawn. Synchronous: it runs in a worker thread that is stopped when
// it takes too long (see pool.ts), or in process for tests.
import {PlotdownError} from "@devlooped/plotdown";
import {renderStatic, type StaticTheme} from "@devlooped/plotdown/static";
import {parseHTML} from "linkedom";
import {DEFAULT_SERVICE_LIMITS, plotdownLimits, type ServiceLimits} from "./limits.js";

export type ImageFormat = "svg" | "png";

export interface RenderJob {
  format: ImageFormat;
  /** The text of the block. */
  text: string;
  theme: StaticTheme;
  /** PNG only: device pixels per CSS pixel. */
  scale: number;
}

/** Why a request gets no image: an HTTP status, a stable code, and a message for people. */
export interface ServiceErrorInfo {
  status: number;
  code: string;
  message: string;
  /** The JSON path of the offending value of the block, such as $.data.d.url. */
  path?: string;
  /** 1-based line and column of a JSON syntax error. */
  line?: number;
  column?: number;
}

export type RenderOutcome =
  | {ok: true; body: Uint8Array; width: number; height: number}
  | {ok: false; error: ServiceErrorInfo};

/** Draws an SVG as a PNG at a scale. */
export type Rasterize = (svg: string, scale: number) => Uint8Array;

/** The document the charts are drawn with: linkedom, as the CLI does (the static SVG is the same with jsdom). */
export function createDocument(): Document {
  return parseHTML("<!DOCTYPE html><html><head></head><body></body></html>").document as unknown as Document;
}

const encoder = new TextEncoder();

/** Renders a job; never throws for a problem of the block, which comes back as an outcome. */
export function renderImage(job: RenderJob, rasterize: Rasterize | undefined, limits: ServiceLimits = DEFAULT_SERVICE_LIMITS): RenderOutcome {
  let chart;
  try {
    chart = renderStatic(job.text, {document: createDocument(), theme: job.theme, limits: plotdownLimits(limits)});
  } catch (error) {
    if (error instanceof PlotdownError) {
      const info: ServiceErrorInfo = {status: 400, code: "invalid-block", message: error.message, path: error.path};
      if (error.line !== undefined) info.line = error.line;
      if (error.column !== undefined) info.column = error.column;
      return {ok: false, error: info};
    }
    throw error;
  }
  if (job.format === "svg") {
    const body = encoder.encode(chart.svg);
    if (body.length > limits.maxSvgBytes) {
      return {ok: false, error: {status: 422, code: "image-too-large", message: `the SVG is ${body.length} bytes, over the limit of ${limits.maxSvgBytes}: draw fewer marks or rows`}};
    }
    return {ok: true, body, width: chart.width, height: chart.height};
  }
  const width = Math.ceil(chart.width * job.scale);
  const height = Math.ceil(chart.height * job.scale);
  if (width > limits.maxPngSide || height > limits.maxPngSide || width * height > limits.maxPngPixels) {
    return {
      ok: false,
      error: {
        status: 422,
        code: "image-too-large",
        message: `the PNG would be ${width} × ${height} pixels, over the limit of ${limits.maxPngSide} pixels a side and ${limits.maxPngPixels} in all: use a smaller scale, width or height`
      }
    };
  }
  if (!rasterize) throw new Error("this renderer draws no PNG");
  return {ok: true, body: rasterize(chart.svg, job.scale), width, height};
}
