/// <reference types="node" />
// The service in Node, with its renderer in worker threads: what the Vercel
// function and the local server run.
import {createRequire} from "node:module";
import os from "node:os";
import {PLOT_VERSION} from "@devlooped/plotdown";
import type {ServiceLimits} from "./limits.js";
import {RenderPool} from "./pool.js";
import {createService, type Handler} from "./service.js";

const require = createRequire(import.meta.url);

/** Names the versions that decide the bytes of an image: the renderer, Plot, and this service (its fonts and rasterizer). */
export function rendererId(): string {
  const plotdown = (require("@devlooped/plotdown/package.json") as {version: string}).version;
  const service = (require("../package.json") as {version: string}).version;
  return `plotdown/${plotdown} plot/${PLOT_VERSION} service/${service}`;
}

export interface NodeServiceOptions {
  limits?: Partial<ServiceLimits>;
  rateLimit?: (request: Request) => Promise<boolean>;
  /** Workers drawing at once: by default one per CPU, at most 2 (each may take 512 MB). */
  workers?: number;
}

/** The handler, and the pool to close when the process ends. */
export function createNodeService(options: NodeServiceOptions = {}): {handle: Handler; pool: RenderPool} {
  const pool = new RenderPool({
    workerUrl: new URL("./worker.js", import.meta.url),
    size: options.workers ?? Math.min(2, Math.max(1, os.availableParallelism())),
    limits: options.limits
  });
  const handle = createService({renderer: pool, rendererId: rendererId(), limits: options.limits, rateLimit: options.rateLimit});
  return {handle, pool};
}
