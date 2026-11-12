/// <reference types="node" />
// The worker thread of the render pool: it loads the renderer once, says it is
// ready, then draws one chart per message.
import {parentPort, workerData} from "node:worker_threads";
import type {ServiceLimits} from "./limits.js";
import type {WorkerRequest, WorkerResponse} from "./pool.js";
import {rasterize} from "./raster.js";
import {renderImage} from "./render.js";

const port = parentPort!;
const limits = (workerData as {limits: ServiceLimits}).limits;

port.on("message", (message: WorkerRequest) => {
  let response: WorkerResponse;
  try {
    if ("job" in message) response = {id: message.id, outcome: renderImage(message.job, rasterize, limits)};
    else response = {id: message.id, png: rasterize(message.raster.svg, message.raster.scale)};
  } catch (error) {
    response = {id: message.id, failure: error instanceof Error ? error.message : String(error)};
  }
  const body = "outcome" in response && response.outcome.ok ? response.outcome.body : "png" in response ? response.png : undefined;
  port.postMessage(response, body ? [body.buffer as ArrayBuffer] : []);
});

port.postMessage({type: "ready"} satisfies WorkerResponse);
