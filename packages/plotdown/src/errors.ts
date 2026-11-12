/** A segment of a JSON path: an object key or an array index. */
export type PathSegment = string | number;

/** Formats a JSON path as `$.marks[0].x`, with `["…"]` for keys that are not identifiers. */
export function formatPath(path: readonly PathSegment[]): string {
  let out = "$";
  for (const segment of path) {
    if (typeof segment === "number") out += `[${segment}]`;
    else if (/^[A-Za-z_$][\w$]*$/.test(segment)) out += `.${segment}`;
    else out += `[${JSON.stringify(segment)}]`;
  }
  return out;
}

export interface PlotdownErrorOptions {
  /** 1-based line of a JSON syntax error in the source text. */
  line?: number;
  /** 1-based column of a JSON syntax error in the source text. */
  column?: number;
  cause?: unknown;
}

/**
 * The only error plotdown throws. `path` is the JSON path of the offending value,
 * such as `$.marks[1].transform[0].binX`, and `message` says what is wrong with it.
 */
export class PlotdownError extends Error {
  override readonly name = "PlotdownError";
  readonly path: string;
  readonly line?: number;
  readonly column?: number;

  constructor(path: string | readonly PathSegment[], message: string, options: PlotdownErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : {cause: options.cause});
    this.path = typeof path === "string" ? path : formatPath(path);
    if (options.line !== undefined) this.line = options.line;
    if (options.column !== undefined) this.column = options.column;
  }

  override toString(): string {
    return `PlotdownError at ${this.path}: ${this.message}`;
  }
}

/** Throws a PlotdownError at the given path. */
export function fail(path: readonly PathSegment[], message: string): never {
  throw new PlotdownError(path, message);
}
