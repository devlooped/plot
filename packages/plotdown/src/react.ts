// @devlooped/plotdown/react: <Plotdown code={…} />, a chart drawn on the client.
import {createElement, useEffect, useRef, useState, type ReactNode} from "react";
import {errorText} from "./adapter.js";
import {PlotdownError} from "./errors.js";
import {render, renderAsync} from "./render.js";
import type {PlotdownOptions, RenderAsyncOptions} from "./types.js";

export interface PlotdownProps extends PlotdownOptions {
  /** The text of the plot block (or a parsed object). */
  code: string | object;
  /** The block is still streaming: show the placeholder, not an error. */
  isIncomplete?: boolean;
  /** Added to the class of the outer element (`plotdown`). */
  className?: string;
  /** Shown while the block is incomplete or its data loads. */
  placeholder?: ReactNode;
  /** Loads data URLs when allowRemote allows them; defaults to globalThis.fetch. */
  fetch?: RenderAsyncOptions["fetch"];
  /** Called when the block fails. */
  onError?: (error: PlotdownError) => void;
}

type State = {status: "pending"} | {status: "chart"} | {status: "error"; error: PlotdownError};

/**
 * Renders a plot block. The chart is drawn in an effect, so on the server (and
 * in the first paint) the component holds the placeholder. While isIncomplete
 * it shows the placeholder; a block that fails shows its source with the reason.
 */
export function Plotdown(props: PlotdownProps): ReactNode {
  const {code, isIncomplete = false, className, placeholder, fetch, onError, allowRemote, baseUrl, limits} = props;
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({status: "pending"});
  // Options in a key, so a host that passes a new array or object each render does not redraw.
  const optionsKey = JSON.stringify([allowRemote ?? false, baseUrl === undefined ? null : String(baseUrl), limits ?? null]);
  const source = typeof code === "string" ? code : JSON.stringify(code);
  const latest = useRef({fetch, onError});
  latest.current = {fetch, onError};

  useEffect(() => {
    const element = host.current;
    if (isIncomplete || !element) {
      setState({status: "pending"});
      return;
    }
    const options: RenderAsyncOptions = {document: element.ownerDocument};
    if (allowRemote !== undefined) options.allowRemote = allowRemote;
    if (baseUrl !== undefined) options.baseUrl = baseUrl;
    if (limits !== undefined) options.limits = limits;
    const fail = (error: unknown) => {
      const plotdownError = error instanceof PlotdownError ? error : new PlotdownError("$", error instanceof Error ? error.message : String(error));
      latest.current.onError?.(plotdownError);
      setState({status: "error", error: plotdownError});
    };
    let cancelled = false;
    const show = (figure: Element) => {
      if (cancelled) return;
      element.replaceChildren(figure);
      setState({status: "chart"});
    };
    if (allowRemote) {
      const controller = new AbortController();
      if (latest.current.fetch) options.fetch = latest.current.fetch;
      options.signal = controller.signal;
      setState({status: "pending"});
      renderAsync(source, options).then(show, (error: unknown) => {
        if (!cancelled) fail(error);
      });
      return () => {
        cancelled = true;
        controller.abort();
        element.replaceChildren();
      };
    }
    try {
      show(render(source, options));
    } catch (error) {
      fail(error);
    }
    return () => {
      cancelled = true;
      element.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options are compared through optionsKey
  }, [source, isIncomplete, optionsKey]);

  const classes = ["plotdown", state.status === "error" ? "plotdown-error" : "", className ?? ""].filter(Boolean).join(" ");
  return createElement(
    "div",
    {className: classes},
    state.status === "pending"
      ? (placeholder ?? createElement("div", {className: "plotdown-placeholder", role: "status"}, isIncomplete ? "Drawing chart…" : ""))
      : null,
    state.status === "error"
      ? [
          createElement("pre", {key: "source"}, createElement("code", {className: "language-json"}, source)),
          createElement("p", {key: "message", className: "plotdown-message", role: "note"}, errorText(state.error))
        ]
      : null,
    // The chart's element: React renders no children into it, the effect does.
    createElement("div", {ref: host, className: "plotdown-chart", hidden: state.status === "error"})
  );
}

export default Plotdown;
