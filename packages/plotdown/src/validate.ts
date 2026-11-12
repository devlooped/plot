// Checks a block against the allowlists and the security rules, and resolves
// its inline data. Every failure is a PlotdownError naming the JSON path.
import {fail, type PathSegment} from "./errors.js";
import {
  CHANNEL_KEYS,
  CHANNEL_NAMES,
  CHANNEL_OBJECT_KEYS,
  FACET_KEYS,
  LEGEND_KEYS,
  MAP_NAMES,
  MARK_COMMON_KEYS,
  MARKS,
  NORMALIZE_BASES,
  PROJECTION_KEYS,
  REDUCER_NAMES,
  SCALE_KEYS,
  SCALE_NAMES,
  TIP_KEYS,
  TOP_LEVEL_KEYS,
  TRANSFORMS,
  WINDOW_REDUCERS,
  type MarkInfo,
  type TransformInfo
} from "./generated/plot-api.js";
import {coerceRows, DelimitedError, parseDelimited} from "./data.js";
import {MIN_BIN_WIDTH, MIN_PIXEL_SIZE, resolveLimits, type PlotdownLimits} from "./limits.js";
import {parse} from "./parse.js";
import type {MarkSpec, PlotdownOptions, PlotSpec} from "./types.js";
import {checkRemote, isConstantSrc, isInlineImage, isSafeHref, type RemotePolicy} from "./urls.js";

/** Data after validation: rows (typed, dates coerced), GeoJSON, a remote file not yet loaded, or none. */
export type ResolvedData =
  | {kind: "rows"; rows: unknown[]; path: readonly PathSegment[]; delimited: boolean}
  | {kind: "geojson"; value: object; path: readonly PathSegment[]}
  | {kind: "remote"; url: string; format: "csv" | "tsv" | "json"; path: readonly PathSegment[]}
  | {kind: "none"};

export interface PreparedMark {
  spec: MarkSpec;
  info: MarkInfo;
  data: ResolvedData;
  path: readonly PathSegment[];
}

export interface Prepared {
  spec: PlotSpec;
  limits: PlotdownLimits;
  datasets: Map<string, ResolvedData>;
  marks: PreparedMark[];
  facetData: ResolvedData;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const GEOJSON_TYPES = new Set(["Feature", "FeatureCollection", "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection", "Sphere"]);
const FUNCTION_LIKE = /^\s*(?:async\s+)?(?:function\b|\([^()]*\)\s*=>|[\w$]+\s*=>)/;
const REMOTE_CSS_URL = /\burl\s*\(\s*(?!['"]?\s*#)/i;
const INTERVAL = /^(?:\d+ )?(?:millisecond|second|minute|hour|day|week|month|quarter|half|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?$/;
const PERCENTILE = /^p\d\d$/;
const DATASET_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const TOP_FREE_TEXT = new Set(["title", "subtitle", "caption", "ariaLabel", "ariaDescription"]);
const FREE_TEXT = new Set(["label", "ariaDescription"]);
const SORT_KEYS = new Set([...SCALE_NAMES, "channel", "value", "order", "reduce", "reverse", "limit"]);
const BIN_REDUCER_EXTRAS = new Set(["x", "x1", "x2", "y", "y1", "y2", "z"]);
const GROUP_REDUCER_EXTRAS = new Set(["x", "y", "z"]);
const TRANSFORM_INPUTS = new Set(Object.values(TRANSFORMS).flatMap((t) => t.input));

const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

// --- suggestions ---------------------------------------------------------------

function distance(a: string, b: string): number {
  const previous = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]!;
      previous[j] = Math.min(above + 1, previous[j - 1]! + 1, diagonal + (a[i - 1]!.toLowerCase() === b[j - 1]!.toLowerCase() ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

function suggest(word: string, candidates: Iterable<string>): string {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = distance(word, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best !== undefined && bestDistance <= Math.max(1, Math.floor(word.length / 3)) ? `; did you mean "${best}"?` : "";
}

// --- the walk ------------------------------------------------------------------

class Validator {
  readonly limits: PlotdownLimits;
  readonly policy: RemotePolicy;
  readonly datasets = new Map<string, ResolvedData>();

  constructor(options: PlotdownOptions) {
    this.limits = resolveLimits(options.limits);
    this.policy = {allowRemote: options.allowRemote ?? false, baseUrl: options.baseUrl};
  }

  // Depth, forbidden keys and remote CSS url() anywhere in the block, data included.
  preflight(root: unknown): void {
    const stack: [unknown, PathSegment[], number][] = [[root, [], 0]];
    while (stack.length) {
      const [value, path, depth] = stack.pop()!;
      if (typeof value === "string") {
        if (REMOTE_CSS_URL.test(value)) fail(path, `"${clip(value)}" contains a CSS url() that is not a #fragment, which could load from the network`);
        continue;
      }
      if (typeof value !== "object" || value === null) continue;
      if (depth >= this.limits.maxDepth) fail(path, `the block nests deeper than ${this.limits.maxDepth} levels`);
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) stack.push([value[i], [...path, i], depth + 1]);
      } else {
        for (const key of Object.keys(value)) {
          if (FORBIDDEN_KEYS.has(key)) fail([...path, key], `the key "${key}" is not allowed`);
          stack.push([(value as Record<string, unknown>)[key], [...path, key], depth + 1]);
        }
      }
    }
  }

  checkString(value: string, path: readonly PathSegment[], freeText = false): void {
    if (!freeText && FUNCTION_LIKE.test(value)) {
      fail(path, `"${clip(value)}" looks like a JavaScript function; plot blocks hold data only: name a field instead, or use a transform`);
    }
  }

  // A value that is a scalar or an array of scalars (any option without a shape of its own).
  checkPlain(value: unknown, path: readonly PathSegment[], freeText = false): void {
    if (typeof value === "string") return this.checkString(value, path, freeText);
    if (value === null || typeof value === "number" || typeof value === "boolean") return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === "string") this.checkString(v, [...path, i], true);
        else if (Array.isArray(v)) this.checkPlain(v, [...path, i], true);
        else if (v !== null && typeof v !== "number" && typeof v !== "boolean") fail([...path, i], `expected a string, number, boolean or null, not ${typeName(v)}`);
      });
      return;
    }
    fail(path, `expected a string, number, boolean, null or array, not ${typeName(value)}`);
  }

  checkKeys(object: Record<string, unknown>, allowed: ReadonlySet<string> | readonly string[], path: readonly PathSegment[], what: string): void {
    const set = allowed instanceof Set ? allowed : new Set(allowed as readonly string[]);
    for (const key of Object.keys(object)) {
      if (!set.has(key)) fail([...path, key], `unknown ${what} "${key}"${suggest(key, set)}`);
    }
  }

  object(value: unknown, path: readonly PathSegment[], what: string): Record<string, unknown> {
    if (!isPlainObject(value)) fail(path, `${what} must be an object, not ${typeName(value)}`);
    return value;
  }

  // --- top level ---

  validate(spec: unknown): Prepared {
    this.preflight(spec);
    const root = this.object(spec, [], "a plot block") as PlotSpec;
    this.checkKeys(root, TOP_LEVEL_KEYS, [], "option");

    if (has(root, "data")) {
      const data = this.object(root.data, ["data"], "data");
      for (const [name, value] of Object.entries(data)) {
        if (!DATASET_NAME.test(name)) fail(["data", name], `dataset name "${name}" must start with a letter or _ and hold only letters, digits, _ and -`);
        this.datasets.set(name, this.dataset(value, ["data", name]));
      }
    }

    if (!has(root, "marks")) fail([], 'a plot block needs a "marks" array');
    if (!Array.isArray(root.marks)) fail(["marks"], `marks must be an array, not ${typeName(root.marks)}`);
    if (root.marks.length > this.limits.maxMarks) fail(["marks"], `the block has ${root.marks.length} marks; the limit is ${this.limits.maxMarks}`);
    const marks = root.marks.map((mark, i) => this.mark(mark, ["marks", i]));

    let facetData: ResolvedData = {kind: "none"};
    for (const [key, value] of Object.entries(root)) {
      const path = [key];
      if (key === "marks" || key === "data") continue;
      if (key === "$schema") {
        if (typeof value !== "string") fail(path, "$schema must be a string");
      } else if (SCALE_NAMES.includes(key)) this.scale(key, value, path);
      else if (key === "projection") this.projection(value, path);
      else if (key === "facet") facetData = this.facet(value, path);
      else if (key === "style") this.style(value, path);
      else if (key === "clip") this.clip(value, path);
      else if (key === "width" || key === "height") this.dimension(value, path);
      else if (key === "title" || key === "subtitle" || key === "caption") {
        if (typeof value !== "string" && value !== null) fail(path, `${key} must be a string`);
      } else this.checkPlain(value, path, TOP_FREE_TEXT.has(key) || FREE_TEXT.has(key));
    }
    return {spec: root, limits: this.limits, datasets: this.datasets, marks, facetData};
  }

  dimension(value: unknown, path: readonly PathSegment[]): void {
    if (typeof value !== "number" || !(value > 0)) fail(path, "must be a positive number");
    if (value > this.limits.maxDimension) fail(path, `${value} is larger than the limit of ${this.limits.maxDimension} pixels`);
  }

  style(value: unknown, path: readonly PathSegment[]): void {
    if (value === null) return;
    const check = (text: string, p: readonly PathSegment[]) => {
      if (/\\|@import|expression\s*\(|image-set\s*\(|image\s*\(|cross-fade\s*\(|element\s*\(/i.test(text)) {
        fail(p, `"${clip(text)}" uses CSS that is not allowed in a plot block (escapes, @import, image functions)`);
      }
    };
    if (typeof value === "string") return check(value, path);
    const style = this.object(value, path, "style");
    for (const [key, v] of Object.entries(style)) {
      if (typeof v === "string") check(v, [...path, key]);
      else if (typeof v !== "number") fail([...path, key], `a style value must be a string or a number, not ${typeName(v)}`);
      check(key, [...path, key]);
    }
  }

  clip(value: unknown, path: readonly PathSegment[]): void {
    if (value === null || typeof value === "boolean" || value === "frame" || value === "sphere") return;
    if (isPlainObject(value) && typeof value.type === "string" && GEOJSON_TYPES.has(value.type)) return;
    fail(path, 'clip must be true, false, null, "frame", "sphere" or a GeoJSON object');
  }

  scale(name: string, value: unknown, path: readonly PathSegment[]): void {
    if (value === null || value === undefined) return;
    const scale = this.object(value, path, `the ${name} scale`);
    this.checkKeys(scale, new Set([...SCALE_KEYS, ...(LEGEND_KEYS[name] ?? [])]), path, `${name} scale option`);
    for (const [key, v] of Object.entries(scale)) {
      const p = [...path, key];
      if (key === "interval") this.interval(v, p);
      else if (key === "style") this.style(v, p);
      else this.checkPlain(v, p, FREE_TEXT.has(key));
    }
  }

  projection(value: unknown, path: readonly PathSegment[]): void {
    if (value === null || typeof value === "string") {
      if (typeof value === "string") this.checkString(value, path);
      return;
    }
    const projection = this.object(value, path, "projection");
    this.checkKeys(projection, PROJECTION_KEYS, path, "projection option");
    for (const [key, v] of Object.entries(projection)) {
      const p = [...path, key];
      if (key === "domain") this.clip(v, p);
      else if (key === "clip") {
        if (!(v === null || typeof v === "boolean" || typeof v === "number" || v === "frame")) fail(p, 'projection clip must be true, false, null, "frame" or an angle');
      } else this.checkPlain(v, p);
    }
  }

  facet(value: unknown, path: readonly PathSegment[]): ResolvedData {
    if (value === null || value === undefined) return {kind: "none"};
    const facet = this.object(value, path, "facet");
    this.checkKeys(facet, FACET_KEYS, path, "facet option");
    let data: ResolvedData = {kind: "none"};
    for (const [key, v] of Object.entries(facet)) {
      const p = [...path, key];
      if (key === "data") data = this.markData(v, p);
      else if (key === "x" || key === "y") this.channel(v, p);
      else this.checkPlain(v, p, FREE_TEXT.has(key));
    }
    return data;
  }

  // --- data ---

  dataset(value: unknown, path: readonly PathSegment[]): ResolvedData {
    if (Array.isArray(value)) {
      if (value.length > this.limits.maxRows) fail(path, `${value.length} rows; the limit is ${this.limits.maxRows}`);
      return {kind: "rows", rows: coerceRows(value), path, delimited: false};
    }
    if (!isPlainObject(value)) fail(path, `data must be an array of rows, the name of a dataset, {"csv": …}, {"tsv": …}, {"url": …} or GeoJSON, not ${typeName(value)}`);
    if (typeof value.type === "string" && GEOJSON_TYPES.has(value.type)) return {kind: "geojson", value, path};
    if (has(value, "csv") || has(value, "tsv")) {
      const key = has(value, "csv") ? "csv" : "tsv";
      this.checkKeys(value, [key], path, "data option");
      const text = value[key];
      if (typeof text !== "string") fail([...path, key], `${key} must be a string of ${key.toUpperCase()} text with a header row`);
      try {
        return {kind: "rows", rows: parseDelimited(text, key === "csv" ? "," : "\t", this.limits.maxRows), path: [...path, key], delimited: true};
      } catch (error) {
        if (error instanceof DelimitedError) fail([...path, key], `row ${error.row}: ${error.message}`);
        throw error;
      }
    }
    if (has(value, "url")) {
      this.checkKeys(value, ["url", "format"], path, "data option");
      const url = value.url;
      if (typeof url !== "string") fail([...path, "url"], "url must be a string");
      const resolved = checkRemote(url, this.policy, [...path, "url"], "the data URL");
      let format = value.format;
      if (format === undefined) {
        const extension = /\.(csv|tsv|json|geojson)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
        format = extension === "geojson" ? "json" : extension;
        if (format === undefined) fail(path, 'the format of the data URL is unknown: add "format": "csv", "tsv" or "json"');
      }
      if (format !== "csv" && format !== "tsv" && format !== "json") fail([...path, "format"], 'format must be "csv", "tsv" or "json"');
      return {kind: "remote", url: resolved, format, path};
    }
    if (has(value, "type")) fail([...path, "type"], `"${String(value.type)}" is not a GeoJSON type`);
    fail(path, `data must be an array of rows, the name of a dataset, {"csv": …}, {"tsv": …}, {"url": …} or GeoJSON`);
  }

  markData(value: unknown, path: readonly PathSegment[]): ResolvedData {
    if (value === null || value === undefined) return {kind: "none"};
    if (typeof value === "string") {
      const data = this.datasets.get(value);
      if (!data) {
        const names = [...this.datasets.keys()];
        fail(path, `no dataset named "${value}" in the top-level data map${names.length ? suggest(value, names) || ` (it has ${names.map((n) => `"${n}"`).join(", ")})` : ""}`);
      }
      return data;
    }
    return this.dataset(value, path);
  }

  // --- marks ---

  mark(value: unknown, path: readonly PathSegment[]): PreparedMark {
    const mark = this.object(value, path, "a mark") as MarkSpec;
    if (!has(mark, "mark")) fail(path, 'a mark needs a "mark" key naming the Plot mark, such as "dot" or "barY"');
    const name = mark.mark;
    if (typeof name !== "string" || !has(MARKS, name)) {
      fail([...path, "mark"], `unknown mark ${JSON.stringify(name)}${typeof name === "string" ? suggest(name, Object.keys(MARKS)) : ""}`);
    }
    const info = MARKS[name]!;

    const transforms: [string, TransformInfo][] = [];
    if (has(mark, "transform")) {
      if (!Array.isArray(mark.transform)) fail([...path, "transform"], "transform must be an array of {\"<name>\": <argument>} objects");
      mark.transform.forEach((t, i) => transforms.push(this.transform(t, [...path, "transform", i])));
    }

    const allowed = new Set<string>(["mark", "transform", ...(info.common ? MARK_COMMON_KEYS : []), ...info.keys]);
    if (info.call !== "none") allowed.add("data");
    for (const [, t] of transforms) for (const key of t.input) allowed.add(key);
    for (const key of Object.keys(mark)) {
      if (allowed.has(key)) continue;
      if (key === "data") fail([...path, key], `the ${name} mark takes no data`);
      if (TRANSFORM_INPUTS.has(key)) {
        const users = Object.entries(TRANSFORMS).filter(([, t]) => t.input.includes(key)).map(([n]) => n);
        fail([...path, key], `"${key}" is an option of the ${users.join(", ")} transform${users.length > 1 ? "s" : ""}, which this mark does not have`);
      }
      fail([...path, key], `unknown option "${key}" for the ${name} mark${suggest(key, allowed)}`);
    }

    const data = info.call === "none" ? ({kind: "none"} as const) : this.markData(mark.data, [...path, "data"]);
    for (const [key, v] of Object.entries(mark)) {
      if (key === "mark" || key === "data" || key === "transform") continue;
      this.markOption(key, v, [...path, key]);
    }
    if (name === "image") this.checkSrc(mark, data, path);
    this.checkHref(mark.href, data, [...path, "href"]);
    if (isPlainObject(mark.tip)) this.checkHref(mark.tip.href, data, [...path, "tip", "href"]);
    return {spec: mark, info, data, path};
  }

  markOption(key: string, value: unknown, path: readonly PathSegment[]): void {
    switch (key) {
      case "tip":
        return this.tip(value, path);
      case "sort":
        return this.sort(value, path);
      case "clip":
        return this.clip(value, path);
      case "channels": {
        const channels = this.object(value, path, "channels");
        for (const [k, v] of Object.entries(channels)) this.channel(v, [...path, k]);
        return;
      }
      case "format": {
        if (typeof value === "string") return this.checkString(value, path);
        const format = this.object(value, path, "format");
        this.checkKeys(format, CHANNEL_NAMES, path, "channel");
        for (const [k, v] of Object.entries(format)) {
          if (typeof v === "string") this.checkString(v, [...path, k]);
          else if (v !== null && typeof v !== "boolean") fail([...path, k], "a tip format must be a format string, true, false or null");
        }
        return;
      }
      case "autoMark":
        if (!["area", "bar", "dot", "line", "rule"].includes(value as string)) fail(path, 'autoMark must be "area", "bar", "dot", "line" or "rule"');
        return;
      case "interval":
        return this.interval(value, path);
      case "pixelSize":
        if (typeof value !== "number" || !(value >= MIN_PIXEL_SIZE)) fail(path, `pixelSize must be a number of at least ${MIN_PIXEL_SIZE}`);
        return;
      case "binWidth":
        if (typeof value !== "number" || !(value >= MIN_BIN_WIDTH)) fail(path, `binWidth must be a number of at least ${MIN_BIN_WIDTH}`);
        return;
      case "thresholds":
        if (typeof value === "number" && value > this.limits.maxThresholds) fail(path, `${value} thresholds; the limit is ${this.limits.maxThresholds}`);
        if (typeof value === "string" && !["auto", "freedman-diaconis", "scott", "sturges"].includes(value)) return this.interval(value, path);
        return this.checkPlain(value, path);
    }
    if (CHANNEL_KEYS.includes(key) || key === "px" || key === "py") return this.channel(value, path);
    this.checkPlain(value, path, FREE_TEXT.has(key));
  }

  channel(value: unknown, path: readonly PathSegment[]): void {
    if (typeof value === "string") return this.checkString(value, path);
    if (value === null || typeof value === "number" || typeof value === "boolean") return;
    if (Array.isArray(value)) {
      if (value.length > this.limits.maxRows) fail(path, `${value.length} values; the limit is ${this.limits.maxRows}`);
      return this.checkPlain(value, path, true);
    }
    const channel = this.object(value, path, "a channel");
    this.checkKeys(channel, CHANNEL_OBJECT_KEYS, path, "channel option");
    for (const [key, v] of Object.entries(channel)) {
      const p = [...path, key];
      if (key === "value") {
        if (isPlainObject(v)) fail(p, "a channel value must be a field name, a constant or an array");
        this.channel(v, p);
      } else if (key === "interval") this.interval(v, p);
      else if (key === "reduce") {
        if (v !== null) this.reducer(v, p, "group");
      } else if (key === "thresholds") this.markOption("thresholds", v, p);
      else this.checkPlain(v, p, FREE_TEXT.has(key));
    }
  }

  tip(value: unknown, path: readonly PathSegment[]): void {
    if (typeof value === "boolean" || value === "x" || value === "y" || value === "xy") return;
    if (typeof value === "string") fail(path, 'tip must be true, false, "x", "y", "xy" or an object of tip options');
    const tip = this.object(value, path, "tip");
    this.checkKeys(tip, TIP_KEYS, path, "tip option");
    for (const [key, v] of Object.entries(tip)) {
      if (key === "pointer") {
        if (v !== "x" && v !== "y" && v !== "xy") fail([...path, key], 'pointer must be "x", "y" or "xy"');
      } else if (key === "tip") fail([...path, key], "a tip cannot have a tip");
      else this.markOption(key, v, [...path, key]);
    }
  }

  sort(value: unknown, path: readonly PathSegment[]): void {
    if (!isPlainObject(value)) return this.channel(value, path);
    this.checkKeys(value, SORT_KEYS, path, "sort option");
    for (const [key, v] of Object.entries(value)) {
      const p = [...path, key];
      if (key === "value") this.channel(v, p);
      else if (key === "reduce") {
        if (v !== null && typeof v !== "boolean") this.reducer(v, p, "group");
      } else if (SCALE_NAMES.includes(key) && isPlainObject(v)) {
        this.checkKeys(v, ["value", "reduce", "order", "reverse", "limit"], p, "sort option");
        for (const [k, w] of Object.entries(v)) this.checkPlain(w, [...p, k]);
      } else this.checkPlain(v, p);
    }
  }

  interval(value: unknown, path: readonly PathSegment[]): void {
    if (typeof value === "number" && value > 0) return;
    if (typeof value === "string" && INTERVAL.test(value)) return;
    fail(path, `an interval must be a positive number or a time interval such as "day", "week", "month", "3 months"; got ${JSON.stringify(value)}`);
  }

  reducer(value: unknown, path: readonly PathSegment[], kind: "bin" | "group" | "window"): void {
    if (typeof value === "string") {
      if (PERCENTILE.test(value)) return;
      const names = kind === "window" ? WINDOW_REDUCERS : REDUCER_NAMES;
      if (names.includes(value)) return;
      if (kind === "bin" && BIN_REDUCER_EXTRAS.has(value)) return;
      if (kind === "group" && GROUP_REDUCER_EXTRAS.has(value)) return;
      this.checkString(value, path);
      fail(path, `unknown reducer "${value}"${suggest(value, names)}`);
    }
    fail(path, `a reducer must be a name such as "count", "sum" or "mean", not ${typeName(value)}`);
  }

  // --- transforms ---

  transform(value: unknown, path: readonly PathSegment[]): [string, TransformInfo] {
    const t = this.object(value, path, 'a transform ({"<name>": <argument>})');
    const keys = Object.keys(t);
    if (keys.length !== 1) fail(path, `a transform is an object with exactly one key, its name; this one has ${keys.length}`);
    const name = keys[0]!;
    if (!has(TRANSFORMS, name)) fail([...path, name], `unknown transform "${name}"${suggest(name, Object.keys(TRANSFORMS))}`);
    const info = TRANSFORMS[name]!;
    const arg = t[name];
    const p = [...path, name];
    if (info.arg === "outputs") this.outputs(arg, p, info);
    else if (info.arg === "merge") {
      if (arg !== true) {
        const options = this.object(arg, p, `the argument of ${name} (true or an object)`);
        this.checkKeys(options, info.input, p, `${name} option`);
        for (const [k, v] of Object.entries(options)) this.markOption(k, v, [...p, k]);
      }
    } else this.firstArg(name, info, arg, p);
    return [name, info];
  }

  outputs(value: unknown, path: readonly PathSegment[], info: TransformInfo): void {
    const outputs = this.object(value, path, "the outputs of a transform");
    const optionKeys = info.outputOptions ?? [];
    this.checkKeys(outputs, new Set([...CHANNEL_NAMES, ...optionKeys]), path, "output");
    for (const [key, v] of Object.entries(outputs)) {
      const p = [...path, key];
      if (optionKeys.includes(key)) {
        if (key === "data" || key === "filter" || key === "sort") {
          if (v !== null) this.reducer(v, p, "group");
        } else if (key === "z") this.channel(v, p);
        else if (key === "reverse") {
          if (typeof v !== "boolean") fail(p, "reverse must be true or false");
        } else this.markOption(key, v, p);
      } else if (v === null) continue;
      else if (info.reducers === "map") {
        if (typeof v !== "string" || !MAP_NAMES.includes(v)) fail(p, `a map must be ${MAP_NAMES.map((n) => `"${n}"`).join(", ")}`);
      } else if (isPlainObject(v)) {
        this.checkKeys(v, ["reduce", "scale", "label"], p, "output option");
        if (!has(v, "reduce")) fail(p, 'an output object needs a "reduce" key');
        this.reducer(v.reduce, [...p, "reduce"], info.reducers === "bin" ? "bin" : "group");
        for (const [k, w] of Object.entries(v)) if (k !== "reduce") this.checkPlain(w, [...p, k], k === "label");
      } else this.reducer(v, p, info.reducers === "bin" ? "bin" : "group");
    }
  }

  firstArg(name: string, info: TransformInfo, value: unknown, path: readonly PathSegment[]): void {
    switch (info.kind) {
      case "stack": {
        if (value === true) return;
        const options = this.object(value, path, `the argument of ${name} (true or {offset, order, reverse, z})`);
        this.checkKeys(options, ["offset", "order", "reverse", "z"], path, `${name} option`);
        for (const [k, v] of Object.entries(options)) (k === "z" ? this.channel(v, [...path, k]) : this.checkPlain(v, [...path, k]));
        return;
      }
      case "map":
        if (typeof value !== "string" || !MAP_NAMES.includes(value)) fail(path, `${name} takes a map name: ${MAP_NAMES.map((n) => `"${n}"`).join(", ")}`);
        return;
      case "normalize": {
        const basis = (v: unknown, p: readonly PathSegment[]) => {
          if (typeof v !== "string" || !(NORMALIZE_BASES.includes(v) || PERCENTILE.test(v))) fail(p, `a normalize basis must be one of ${NORMALIZE_BASES.join(", ")} or a percentile such as "p90"`);
        };
        if (value === true) return;
        if (typeof value === "string") return basis(value, path);
        const options = this.object(value, path, `the argument of ${name} (a basis name or {basis})`);
        this.checkKeys(options, ["basis"], path, `${name} option`);
        if (has(options, "basis")) basis(options.basis, [...path, "basis"]);
        return;
      }
      case "window": {
        const k = (v: unknown, p: readonly PathSegment[]) => {
          if (!Number.isInteger(v) || (v as number) < 1) fail(p, "the window size k must be a positive integer");
        };
        if (typeof value === "number") return k(value, path);
        const options = this.object(value, path, `the argument of ${name} (k or {k, reduce, anchor, shift, strict})`);
        this.checkKeys(options, ["k", "reduce", "anchor", "shift", "strict"], path, `${name} option`);
        if (!has(options, "k")) fail(path, `${name} needs the window size k`);
        for (const [key, v] of Object.entries(options)) {
          if (key === "k") k(v, [...path, key]);
          else if (key === "reduce") this.reducer(v, [...path, key], "window");
          else this.checkPlain(v, [...path, key]);
        }
        return;
      }
      case "dodge": {
        if (value === true) return;
        if (typeof value === "string") return this.checkString(value, path);
        const options = this.object(value, path, `the argument of ${name} (an anchor or {anchor, padding, r})`);
        this.checkKeys(options, ["anchor", "padding", "r"], path, `${name} option`);
        for (const [k, v] of Object.entries(options)) (k === "r" ? this.channel(v, [...path, k]) : this.checkPlain(v, [...path, k]));
        return;
      }
      case "selector": {
        if (value === "first" || value === "last") return;
        const selector = this.object(value, path, 'the selector of select ("first", "last" or {"<channel>": "min" | "max"})');
        const keys = Object.keys(selector);
        if (keys.length !== 1) fail(path, 'a selector object has exactly one key, such as {"y": "max"}');
        this.checkKeys(selector, CHANNEL_NAMES, path, "channel");
        if (selector[keys[0]!] !== "min" && selector[keys[0]!] !== "max") fail([...path, keys[0]!], 'must be "min" or "max"');
        return;
      }
      case "interval":
        return this.interval(value, path);
      case "channel":
        return this.channel(value, path);
      case "sort":
        if (isPlainObject(value)) {
          this.checkKeys(value, ["channel", "value", "order"], path, "sort option");
          for (const [k, v] of Object.entries(value)) (k === "value" ? this.channel(v, [...path, k]) : this.checkPlain(v, [...path, k]));
          if (has(value, "order") && value.order !== "ascending" && value.order !== "descending") fail([...path, "order"], 'order must be "ascending" or "descending"');
          return;
        }
        return this.channel(value, path);
    }
    fail(path, `unsupported transform ${name}`);
  }

  // --- links and images ---

  // Values of a channel over the rows of the mark: a field, an array, or {value}.
  *channelValues(channel: unknown, data: ResolvedData, path: readonly PathSegment[]): Generator<[unknown, readonly PathSegment[], string]> {
    if (isPlainObject(channel)) channel = channel.value;
    if (Array.isArray(channel)) {
      for (let i = 0; i < channel.length; i++) yield [channel[i], [...path, i], ""];
    } else if (typeof channel === "string" && data.kind === "rows") {
      for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i];
        const v = isPlainObject(row) || Array.isArray(row) ? (row as Record<string, unknown>)[channel] : undefined;
        if (data.delimited) yield [v, data.path, ` (row ${i + 1}, column "${channel}")`];
        else yield [v, [...data.path, i, channel], ""];
      }
    }
  }

  checkHref(channel: unknown, data: ResolvedData, path: readonly PathSegment[]): void {
    if (channel === undefined || channel === null) return;
    for (const [value, p, where] of this.channelValues(channel, data, path)) {
      if (value == null) continue;
      if (typeof value !== "string" || !isSafeHref(value)) {
        fail(p, `${JSON.stringify(value)}${where} is not an allowed link: links must be http, https, mailto or relative URLs`);
      }
    }
  }

  checkSrc(mark: MarkSpec, data: ResolvedData, path: readonly PathSegment[]): void {
    const src = mark.src;
    const p = [...path, "src"];
    const check = (value: unknown, at: readonly PathSegment[], where: string) => {
      if (value == null) return;
      if (typeof value !== "string") fail(at, `an image src must be a URL${where}`);
      if (isInlineImage(value)) return;
      checkRemote(value, this.policy, at, `the image${where}`);
    };
    if (typeof src === "string" && isConstantSrc(src)) return check(src, p, "");
    for (const [value, at, where] of this.channelValues(src, data, p)) check(value, at, where);
  }
}

function clip(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/**
 * Checks a block — its text or a parsed object — against the plotdown spec and
 * the host's policy, and resolves its inline data. Throws a PlotdownError at the
 * first problem. Used by render; adapters use validate().
 */
export function prepare(source: string | object, options: PlotdownOptions = {}): Prepared {
  const spec = typeof source === "string" ? parse(source, options) : source;
  return new Validator(options).validate(spec);
}

/**
 * Checks a block — its text or a parsed object — and returns the parsed block.
 * Throws a PlotdownError naming the JSON path of the first problem.
 */
export function validate(source: string | object, options: PlotdownOptions = {}): PlotSpec {
  return prepare(source, options).spec;
}