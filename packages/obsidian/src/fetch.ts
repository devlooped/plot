// A fetch for the core's remote data, on top of Obsidian's requestUrl: it is not
// subject to CORS, and it works on desktop and mobile alike.
import type {RequestUrlParam, RequestUrlResponse} from "obsidian";

type RequestUrl = (request: RequestUrlParam) => Promise<RequestUrlResponse>;

// Statuses whose Response may not have a body.
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/** Adapts requestUrl to the fetch signature the core calls: GET only, honoring an abort signal. */
export function requestUrlFetch(requestUrl: RequestUrl): (input: string, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    if (!/^https?:\/\//i.test(input)) {
      throw new Error("only http and https URLs can be loaded; files of the vault cannot be used as data");
    }
    const signal = init?.signal ?? undefined;
    signal?.throwIfAborted();
    const request = requestUrl({url: input, method: "GET", throw: false});
    const response = await (signal ? raceAbort(request, signal) : request);
    const body = NULL_BODY.has(response.status) ? null : response.arrayBuffer;
    return new Response(body, {status: response.status, headers: response.headers});
  };
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error("aborted"));
    signal.addEventListener("abort", onAbort, {once: true});
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}
