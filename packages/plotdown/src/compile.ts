// Turns a validated block into the options of Plot.plot(): data resolved,
// dates coerced, marks and transforms called by name from the allowlists.
import * as Plot from "@observablehq/plot";
import {coerceArray} from "./data.js";
import {fail, PlotdownError, type PathSegment} from "./errors.js";
import {TRANSFORMS} from "./generated/plot-api.js";
import type {MarkSpec, RenderOptions} from "./types.js";
import {isPlainObject, prepare, type Prepared, type PreparedMark, type ResolvedData} from "./validate.js";

type PlotFunction = (...args: unknown[]) => unknown;
const PlotFunctions = Plot as unknown as Record<string, PlotFunction>;
const GEOJSON_TYPES = new Set(["Feature", "FeatureCollection", "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection", "Sphere"]);
const OPTION_EXCLUDED = new Set(["data", "marks", "$schema"]);

/** A deep copy of an option value in which arrays of ISO 8601 strings become Dates. */
function convert(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== "object")) return coerceArray(value);
    return value.map(convert);
  }
  if (isPlainObject(value)) {
    if (typeof value.type === "string" && GEOJSON_TYPES.has(value.type)) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = convert(v);
    return out;
  }
  return value;
}

function dataOf(data: ResolvedData): unknown {
  switch (data.kind) {
    case "rows":
      return data.rows;
    case "geojson":
      return data.value;
    case "remote":
      return fail(data.path, "remote data is not loaded yet: render the block with renderAsync(), or load it first with resolveRemoteData()");
    case "none":
      return undefined;
  }
}

function applyTransform(name: string, arg: unknown, options: Record<string, unknown>): Record<string, unknown> {
  const info = TRANSFORMS[name]!;
  const fn = PlotFunctions[name]!;
  if (info.arg === "merge") return fn(arg === true ? options : {...options, ...(convert(arg) as object)}) as Record<string, unknown>;
  if (arg === true) return fn(options) as Record<string, unknown>; // stack, dodge, normalize with their defaults
  return fn(convert(arg), options) as Record<string, unknown>;
}

function compileMark(mark: PreparedMark): unknown {
  const {mark: name, data: _data, transform, autoMark, ...rest} = mark.spec as MarkSpec & {autoMark?: unknown};
  let options = convert(rest) as Record<string, unknown>;
  if (name === "auto" && autoMark !== undefined) options.mark = autoMark;
  const data = dataOf(mark.data);
  try {
    for (const [i, t] of (transform ?? []).entries()) {
      const tname = Object.keys(t)[0]!;
      try {
        options = applyTransform(tname, t[tname], options);
      } catch (error) {
        throw wrap(error, [...mark.path, "transform", i, tname]);
      }
    }
    const fn = PlotFunctions[name]!;
    if (mark.info.call === "none" || (mark.info.call === "optional" && data === undefined)) return fn(options);
    return fn(data, options);
  } catch (error) {
    throw wrap(error, mark.path);
  }
}

function wrap(error: unknown, path: readonly PathSegment[]): PlotdownError {
  if (error instanceof PlotdownError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new PlotdownError(path, `Plot rejected this: ${message}`, {cause: error});
}

/** Builds the options of Plot.plot() from a prepared block. */
export function compilePrepared(prepared: Prepared, options: RenderOptions = {}): Plot.PlotOptions {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(prepared.spec)) {
    if (OPTION_EXCLUDED.has(key)) continue;
    out[key] = convert(value);
  }
  if (prepared.facetData.kind !== "none") (out.facet as Record<string, unknown>).data = dataOf(prepared.facetData);
  out.marks = prepared.marks.map(compileMark);
  if (options.document) out.document = options.document;
  return out as Plot.PlotOptions;
}

/**
 * Validates a block and returns the equivalent options of Plot.plot(), for hosts
 * that call Plot themselves. Throws a PlotdownError; remote data must be loaded first.
 */
export function toPlotOptions(source: string | object, options: RenderOptions = {}): Plot.PlotOptions {
  return compilePrepared(prepare(source, options), options);
}