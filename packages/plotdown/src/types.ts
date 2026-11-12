/** A JSON value. */
export type JsonValue = string | number | boolean | null | JsonValue[] | {[key: string]: JsonValue};

/** A row of inline data: an object of fields, a value, or an array. */
export type Row = {[field: string]: JsonValue} | string | number | boolean | null | JsonValue[];

/** CSV text with a header row. */
export interface CsvData {
  csv: string;
}

/** TSV text with a header row. */
export interface TsvData {
  tsv: string;
}

/** A remote file, loaded only when the host allows remote data. */
export interface UrlData {
  url: string;
  format?: "csv" | "tsv" | "json";
}

/** A GeoJSON object (Feature, FeatureCollection, a geometry, or {"type": "Sphere"}). */
export interface GeoJsonData {
  type: string;
  [key: string]: JsonValue;
}

/** A dataset of the top-level data map. */
export type Dataset = Row[] | CsvData | TsvData | UrlData | GeoJsonData;

/** The data of a mark: a dataset, or the name of one in the top-level data map. */
export type MarkData = Dataset | string | null;

/** A transform: {"<name>": <first argument>}, e.g. {"binX": {"y": "count"}}. */
export type TransformSpec = {[name: string]: JsonValue};

/** A mark: {"mark": "<name>", "data": …, "transform": […], …options}. */
export interface MarkSpec {
  mark: string;
  data?: MarkData;
  transform?: TransformSpec[];
  [option: string]: unknown;
}

/** A plot block: the options of Plot.plot() as JSON. */
export interface PlotSpec {
  $schema?: string;
  data?: {[name: string]: Dataset};
  marks: MarkSpec[];
  [option: string]: unknown;
}

/** Which remote content (data URLs and images) a host allows. */
export type AllowRemote = boolean | readonly string[];

export interface PlotdownOptions {
  /**
   * Whether data URLs and image marks may load from the network: false (the
   * default), true, or a list of allowed origins such as ["https://cdn.example.com"].
   */
  allowRemote?: AllowRemote;
  /** Resolves relative data and image URLs. */
  baseUrl?: string | URL;
  limits?: Partial<import("./limits.js").PlotdownLimits>;
}

export interface RenderOptions extends PlotdownOptions {
  /** The document that creates the elements: a jsdom or linkedom document outside a browser. */
  document?: Document;
}

export interface FetchOptions extends PlotdownOptions {
  /** The fetch function; defaults to globalThis.fetch. */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

export type RenderAsyncOptions = RenderOptions & FetchOptions;
