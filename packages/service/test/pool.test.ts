import fs from "node:fs";
import {afterAll, describe, expect, it} from "vitest";
import {RenderPool} from "../src/pool.js";
import {rasterize} from "../src/raster.js";
import {renderImage} from "../src/render.js";

// The pool runs the built worker (dist/worker.js): `pnpm build` comes before `pnpm test`.
const workerUrl = new URL("../dist/worker.js", import.meta.url);
if (!fs.existsSync(workerUrl)) throw new Error("build the service first (pnpm build): the render pool runs dist/worker.js");

const dot = '{"title": "Dots", "marks": [{"mark": "dot", "data": [{"x": 1, "y": 2}, {"x": 2, "y": 3}], "x": "x", "y": "y"}]}';
const pools: RenderPool[] = [];
const pool = (limits: ConstructorParameters<typeof RenderPool>[0]["limits"] = {}, size = 1) => {
  const p = new RenderPool({workerUrl, size, limits});
  pools.push(p);
  return p;
};

afterAll(async () => {
  await Promise.all(pools.map((p) => p.close()));
});

describe("RenderPool", () => {
  it("draws in a worker thread the bytes drawn in process", async () => {
    const p = pool();
    for (const job of [{format: "svg", text: dot, theme: "auto", scale: 1}, {format: "png", text: dot, theme: "dark", scale: 2}] as const) {
      const inWorker = await p.render(job);
      const inProcess = renderImage(job, rasterize);
      expect(inWorker.ok).toBe(true);
      expect(inWorker.ok && inProcess.ok && Buffer.from(inWorker.body).equals(Buffer.from(inProcess.body))).toBe(true);
    }
    const invalid = await p.render({format: "svg", text: '{"marks": [{"mark": "nope"}]}', theme: "auto", scale: 1});
    expect(invalid).toMatchObject({ok: false, error: {status: 400, code: "invalid-block", path: "$.marks[0].mark"}});
    expect((await p.rasterize("<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>", 2)).length).toBeGreaterThan(8);
  }, 20_000);

  it("stops a render that takes too long, and draws the next one with a fresh worker", async () => {
    const p = pool({renderTimeout: 1});
    const slow = await p.render({format: "png", text: dot, theme: "light", scale: 4});
    expect(slow).toMatchObject({ok: false, error: {status: 422, code: "render-timeout"}});
    const again = await p.render({format: "png", text: dot, theme: "light", scale: 4});
    expect(again).toMatchObject({ok: false, error: {code: "render-timeout"}}); // still too slow for 1 ms, but answered
  }, 20_000);

  it("refuses renders past its queue", async () => {
    const p = pool({maxQueue: 1});
    const results = await Promise.all([0, 1, 2].map(() => p.render({format: "svg", text: dot, theme: "auto", scale: 1})));
    expect(results.filter((r) => !r.ok && r.error.code === "busy").length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.ok)).toBe(true);
  }, 20_000);
});
