// @vitest-environment jsdom
import {act, createElement} from "react";
import {createRoot, type Root} from "react-dom/client";
import {Streamdown} from "streamdown";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {Plotdown} from "../src/react.js";
import {createPlotRenderer, plotRenderer} from "../src/streamdown.js";
import {BAD, BAR} from "./adapters.js";

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("<Plotdown>", () => {
  it("shows a placeholder while incomplete and the chart when the block completes", async () => {
    await act(async () => root.render(createElement(Plotdown, {code: BAR.slice(0, 30), isIncomplete: true})));
    expect(container.querySelector(".plotdown-placeholder")?.textContent).toBe("Drawing chart…");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector(".plotdown-error")).toBeNull();

    await act(async () => root.render(createElement(Plotdown, {code: BAR, isIncomplete: false})));
    expect(container.querySelector(".plotdown-placeholder")).toBeNull();
    expect(container.querySelectorAll(".plotdown-chart svg rect")).toHaveLength(2);
  });

  it("redraws when the code changes and cleans up when unmounted", async () => {
    await act(async () => root.render(createElement(Plotdown, {code: BAR})));
    const first = container.querySelector("svg");
    expect(first).not.toBeNull();
    await act(async () => root.render(createElement(Plotdown, {code: BAR.replace('"v": 3', '"v": 5')})));
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelector("svg")).not.toBe(first);
    const chart = container.querySelector(".plotdown-chart")!;
    await act(async () => root.render(createElement("p", null, "gone")));
    expect(chart.childNodes).toHaveLength(0);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("does not redraw when a parent re-renders with equal options", async () => {
    const view = () => createElement(Plotdown, {code: BAR, limits: {maxMarks: 10}, allowRemote: false});
    await act(async () => root.render(view()));
    const first = container.querySelector("svg");
    await act(async () => root.render(view()));
    expect(container.querySelector("svg")).toBe(first);
  });

  it("shows the source and the reason when the block fails", async () => {
    const onError = vi.fn();
    await act(async () => root.render(createElement(Plotdown, {code: BAD, onError})));
    expect(container.querySelector(".plotdown-error pre code")?.textContent).toBe(BAD);
    expect(container.querySelector(".plotdown-message")?.textContent).toContain("$.marks[0].mark");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("loads remote data when allowed", async () => {
    const fetch = vi.fn(async () => new Response("k,v\na,1\nb,2\nc,3\n"));
    const code = '{"data": {"d": {"url": "https://data.example.com/d.csv"}}, "marks": [{"mark": "barY", "data": "d", "x": "k", "y": "v"}]}';
    await act(async () => root.render(createElement(Plotdown, {code, allowRemote: true, fetch})));
    await vi.waitFor(() => expect(container.querySelectorAll("svg rect")).toHaveLength(3));
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("plotRenderer for Streamdown", () => {
  it("takes the three fence names", () => {
    expect(plotRenderer.language).toEqual(["plot", "oplot", "observable-plot"]);
  });

  it("shows a placeholder while the fence streams and the chart when it closes", async () => {
    const head = "Here is the chart:\n\n```plot\n";
    const partial = head + BAR.slice(0, 40);
    await act(async () =>
      root.render(createElement(Streamdown, {plugins: {renderers: [plotRenderer]}, isAnimating: true, mode: "streaming"}, partial))
    );
    expect(container.querySelector(".plotdown-placeholder")).not.toBeNull();
    expect(container.querySelector("svg.plot-d6a7b5, .plotdown svg")).toBeNull();
    expect(container.querySelector(".plotdown-error")).toBeNull();

    const done = head + BAR + "\n```\n\nThat is all.";
    await act(async () => root.render(createElement(Streamdown, {plugins: {renderers: [plotRenderer]}, isAnimating: false}, done)));
    await vi.waitFor(() => expect(container.querySelectorAll(".plotdown svg rect")).toHaveLength(2));
    expect(container.querySelector(".plotdown-placeholder")).toBeNull();
  });

  it("renders oplot and observable-plot blocks, and options given to createPlotRenderer", async () => {
    const renderer = createPlotRenderer({className: "chat-chart"});
    const md = "```oplot\n" + BAR + "\n```\n\n```observable-plot\n" + BAR + "\n```\n";
    await act(async () => root.render(createElement(Streamdown, {plugins: {renderers: [renderer]}}, md)));
    await vi.waitFor(() => expect(container.querySelectorAll(".plotdown.chat-chart svg")).toHaveLength(2));
  });
});
