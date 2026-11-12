// plotdown: render fenced plot blocks of strict JSON as Observable Plot charts.
// This entry runs in browsers, Manifest V3 extensions, workers and Node alike:
// it imports nothing but @observablehq/plot.
export {parse, type ParseOptions} from "./parse.js";
export {validate} from "./validate.js";
export {render, renderAsync, type PlotdownFigure} from "./render.js";
export {toPlotOptions} from "./compile.js";
export {resolveRemoteData} from "./remote.js";
export {PlotdownError, formatPath, type PathSegment, type PlotdownErrorOptions} from "./errors.js";
export {FENCE_NAMES, isPlotFence, isPlotSpec, type FenceName} from "./fences.js";
export {DEFAULT_LIMITS, type PlotdownLimits} from "./limits.js";
export {parseIsoDate} from "./data.js";
export {isSafeHref} from "./urls.js";
export {PLOT_VERSION, SPEC_VERSION, MARKS, TRANSFORMS, type MarkInfo, type TransformInfo} from "./generated/plot-api.js";
export type {
  AllowRemote,
  CsvData,
  Dataset,
  FetchOptions,
  GeoJsonData,
  JsonValue,
  MarkData,
  MarkSpec,
  PlotdownOptions,
  PlotSpec,
  RenderAsyncOptions,
  RenderOptions,
  Row,
  TransformSpec,
  TsvData,
  UrlData
} from "./types.js";
