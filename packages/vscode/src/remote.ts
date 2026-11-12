// Remote data for the Markdown preview, loaded by the extension host. The
// preview's Content-Security-Policy has no connect-src, so the webview cannot
// fetch; the host loads the data URLs of a block (when the setting allows it and
// the workspace is trusted), and the preview renders the copy with the data
// inlined. markdown-it is synchronous: a block whose data is not loaded yet
// shows a note, and the preview is refreshed when the data arrives.
import {PlotdownError, resolveRemoteData, type AllowRemote, type FetchOptions} from "@devlooped/plotdown";
import type {Resolution} from "./fences.js";

type Fetch = NonNullable<FetchOptions["fetch"]>;

export interface RemoteDataOptions {
  /** Called when the data of a block has loaded or failed, to render the preview again. */
  onSettled: () => void;
  /** The fetch function (default globalThis.fetch). */
  fetch?: Fetch;
  /** How long a loaded file is kept, in ms (default 60 s). */
  ttl?: number;
  /** How many blocks are remembered (default 200). */
  capacity?: number;
  /** Loads the data of a block (default resolveRemoteData of the core); for tests. */
  resolve?: typeof resolveRemoteData;
}

/** Matches a data URL in a block, cheaply: blocks without one are left to the webview. */
const URL_KEY = /"url"\s*:/;

export class RemoteData {
  private readonly blocks = new Map<string, Resolution>();
  private readonly files = new Map<string, {at: number; text: Promise<{status: number; text: string; url: string}>}>();
  private generation = 0;

  constructor(private readonly options: RemoteDataOptions) {}

  /**
   * The state of the remote data of a block under a policy: undefined when the
   * block names no data URL or the policy allows none (the webview then renders
   * the block as written, and says why a data URL is refused).
   */
  get(code: string, allowRemote: AllowRemote): Resolution | undefined {
    if (!allowRemote || (Array.isArray(allowRemote) && allowRemote.length === 0) || !URL_KEY.test(code)) return undefined;
    const key = `${JSON.stringify(allowRemote)}\n${code}`;
    const known = this.blocks.get(key);
    if (known) return known;
    const pending: Resolution = {state: "pending"};
    this.remember(key, pending);
    const generation = this.generation;
    const resolve = this.options.resolve ?? resolveRemoteData;
    resolve(code, {allowRemote, fetch: this.fetch})
      .then(
        (spec): Resolution => ({state: "ready", text: JSON.stringify(spec)}),
        (error: unknown): Resolution => ({state: "error", message: describe(error)})
      )
      .then((result) => {
        if (generation !== this.generation) return;
        this.remember(key, result);
        this.options.onSettled();
      });
    return pending;
  }

  /** Forgets every block and file, such as when the setting changes. */
  clear(): void {
    this.generation++;
    this.blocks.clear();
    this.files.clear();
  }

  private remember(key: string, value: Resolution): void {
    this.blocks.delete(key);
    this.blocks.set(key, value);
    const capacity = this.options.capacity ?? 200;
    while (this.blocks.size > capacity) this.blocks.delete(this.blocks.keys().next().value!);
  }

  /** fetch, with each file kept for a while: a block edited while its data stays the same loads it once. */
  private readonly fetch: Fetch = async (input, init) => {
    const ttl = this.options.ttl ?? 60_000;
    const now = Date.now();
    let file = this.files.get(input);
    if (!file || now - file.at > ttl) {
      const fetchFn = this.options.fetch ?? globalThis.fetch;
      const text = fetchFn(input, init).then(async (response) => ({status: response.status, text: await response.text(), url: response.url}));
      file = {at: now, text};
      this.files.set(input, file);
      text.catch(() => this.files.delete(input));
    }
    const {status, text, url} = await file.text;
    const response = new Response(status === 204 || status === 205 || status === 304 ? null : text, {status});
    if (url) Object.defineProperty(response, "url", {value: url});
    return response;
  };
}

/** The text of an error as the preview shows it: the JSON path, the reason, and the place. */
export function describe(error: unknown): string {
  if (error instanceof PlotdownError) {
    const place = error.line !== undefined ? ` (line ${error.line}${error.column !== undefined ? `, column ${error.column}` : ""})` : "";
    return `${error.path}: ${error.message}${place}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Reads the plotdown.allowRemoteData setting: false unless the workspace is trusted. */
export function remotePolicy(setting: unknown, trusted: boolean): AllowRemote {
  if (!trusted) return false;
  if (setting === true) return true;
  if (Array.isArray(setting)) {
    const origins = setting.filter((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value.trim())).map((v) => v.trim());
    return origins.length ? origins : false;
  }
  return false;
}
