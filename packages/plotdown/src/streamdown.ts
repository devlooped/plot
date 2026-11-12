// @devlooped/plotdown/streamdown: a ready renderer for Streamdown's
// plugins.renderers hook, which draws plot blocks of a streamed answer.
import {createElement, type ComponentType, type ReactNode} from "react";
import {CodeBlock} from "streamdown";
import {FENCE_NAMES} from "./fences.js";
import {Plotdown, type PlotdownProps} from "./react.js";

/** The props Streamdown gives a custom renderer. */
export interface PlotRendererProps {
  code: string;
  language: string;
  isIncomplete: boolean;
  meta?: string;
}

/** A Streamdown custom renderer: `{language, component}`. */
export interface PlotRenderer {
  language: string[];
  component: ComponentType<PlotRendererProps>;
}

/** Options of the renderer: those of <Plotdown> but the block itself. */
export type PlotRendererOptions = Omit<PlotdownProps, "code" | "isIncomplete">;

/**
 * Makes a renderer with options, such as `createPlotRenderer({allowRemote: ["https://data.example.com"]})`.
 * A `plot` block whose text does not start with `{` (such as gnuplot) stays a
 * Streamdown code block.
 */
export function createPlotRenderer(options: PlotRendererOptions = {}): PlotRenderer {
  function PlotdownRenderer({code, language, isIncomplete}: PlotRendererProps): ReactNode {
    const text = code.trimStart();
    if (language.toLowerCase() === "plot" && text !== "" && !text.startsWith("{")) {
      return createElement(CodeBlock, {code, language, isIncomplete});
    }
    return createElement(Plotdown, {...options, code, isIncomplete});
  }
  return {language: [...FENCE_NAMES], component: PlotdownRenderer};
}

/**
 * Draws `plot`, `oplot` and `observable-plot` blocks: a placeholder while the
 * block streams, the chart when its fence closes.
 *
 * ```tsx
 * <Streamdown plugins={{renderers: [plotRenderer]}}>{markdown}</Streamdown>
 * ```
 */
export const plotRenderer: PlotRenderer = createPlotRenderer();

export default plotRenderer;
