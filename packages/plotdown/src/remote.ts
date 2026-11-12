// Loads the remote data of a block (data URLs), under the host's policy.
import {fail, PlotdownError, type PathSegment} from "./errors.js";
import type {FetchOptions, PlotSpec} from "./types.js";
import {normalizeOrigin} from "./urls.js";
import {isPlainObject, prepare, type ResolvedData} from "./validate.js";

/**
 * Returns a copy of the block in which every data URL is replaced by the data it
 * points to ({"csv": …}, {"tsv": …}, rows or GeoJSON), fetched with
 * options.fetch or globalThis.fetch, without credentials or referrer. The result
 * renders with the synchronous render(). A block without data URLs is returned
 * as is. Rejects with a PlotdownError; the URLs must pass options.allowRemote.
 */
export async function resolveRemoteData(source: string | object, options: FetchOptions = {}): Promise<PlotSpec> {
  const prepared = prepare(source, options);
  const remotes: Extract<ResolvedData, {kind: "remote"}>[] = [];
  const seen = new Set<ResolvedData>();
  const add = (data: ResolvedData) => {
    if (data.kind === "remote" && !seen.has(data)) {
      seen.add(data);
      remotes.push(data);
    }
  };
  for (const data of prepared.datasets.values()) add(data);
  for (const mark of prepared.marks) add(mark.data);
  add(prepared.facetData);
  if (remotes.length === 0) return prepared.spec;

  const fetchFn = options.fetch ?? (typeof fetch === "function" ? fetch : undefined);
  if (!fetchFn) throw new PlotdownError(remotes[0]!.path, "there is no fetch function to load remote data: pass the fetch option");
  const limits = prepared.limits;
  const loads = new Map<string, Promise<string>>();
  const load = (remote: (typeof remotes)[number]) => {
    let promise = loads.get(remote.url);
    if (!promise) loads.set(remote.url, (promise = fetchText(fetchFn, remote.url, remote.path, options, limits.maxFetchLength, limits.fetchTimeout)));
    return promise;
  };
  const copy = structuredClone(prepared.spec) as PlotSpec;
  await Promise.all(
    remotes.map(async (remote) => {
      const text = await load(remote);
      let value: unknown;
      if (remote.format === "json") {
        try {
          value = JSON.parse(text);
        } catch (error) {
          fail([...remote.path, "url"], `the file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!Array.isArray(value) && !(isPlainObject(value) && typeof value.type === "string")) {
          fail([...remote.path, "url"], "a JSON data file must hold an array of rows or a GeoJSON object");
        }
      } else value = {[remote.format]: text};
      setAt(copy, remote.path, value);
    })
  );
  return copy;
}

function setAt(root: unknown, path: readonly PathSegment[], value: unknown): void {
  let node = root as Record<string | number, unknown>;
  for (const segment of path.slice(0, -1)) node = node[segment] as Record<string | number, unknown>;
  node[path[path.length - 1]!] = value;
}

async function fetchText(
  fetchFn: NonNullable<FetchOptions["fetch"]>,
  url: string,
  path: readonly PathSegment[],
  options: FetchOptions,
  maxLength: number,
  timeout: number
): Promise<string> {
  const at = [...path, "url"];
  const signals = [options.signal, typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(timeout) : undefined].filter(
    (s): s is AbortSignal => s !== undefined
  );
  const signal = signals.length > 1 && "any" in AbortSignal ? AbortSignal.any(signals) : signals[0];
  let response: Response;
  try {
    response = await fetchFn(url, {credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", ...(signal ? {signal} : {})});
  } catch (error) {
    throw new PlotdownError(at, `could not load "${url}": ${error instanceof Error ? error.message : String(error)}`, {cause: error});
  }
  if (!response.ok) fail(at, `could not load "${url}": HTTP ${response.status}`);
  if (Array.isArray(options.allowRemote) && response.url) {
    const origin = new URL(response.url).origin;
    if (!options.allowRemote.map(normalizeOrigin).includes(origin)) fail(at, `"${url}" redirected to ${origin}, which is not an allowed origin`);
  }
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxLength) fail(at, `"${url}" is ${declared} bytes; the limit is ${maxLength}`);
  if (!response.body) {
    const text = await response.text();
    if (text.length > maxLength) fail(at, `"${url}" is longer than the limit of ${maxLength} characters`);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    text += decoder.decode(value, {stream: true});
    if (text.length > maxLength) {
      await reader.cancel();
      fail(at, `"${url}" is longer than the limit of ${maxLength} characters`);
    }
  }
  return text + decoder.decode();
}
