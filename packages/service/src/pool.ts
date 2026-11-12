/// <reference types="node" />
// Renders in worker threads, so that a render that takes too long can be
// stopped: a chart is drawn synchronously, and JavaScript cannot interrupt its
// own thread. Each worker draws one chart at a time; when the time limit passes,
// the worker is terminated and a fresh one takes its place. Requests wait in a
// short queue; past it they are refused (503), which keeps one instance from
// piling up work it cannot finish.
import {Worker} from "node:worker_threads";
import {DEFAULT_SERVICE_LIMITS, type ServiceLimits} from "./limits.js";
import type {RenderJob, RenderOutcome} from "./render.js";
import type {ImageRenderer} from "./service.js";

export interface PoolOptions {
  /** The worker script: dist/worker.js. */
  workerUrl: URL;
  /** Workers drawing at once; one per CPU is plenty. */
  size?: number;
  limits?: Partial<ServiceLimits>;
}

/** A message to a worker. */
export type WorkerRequest = {id: number; job: RenderJob} | {id: number; raster: {svg: string; scale: number}};
/** A message from a worker. */
export type WorkerResponse = {type: "ready"} | {id: number; outcome: RenderOutcome} | {id: number; png: Uint8Array} | {id: number; failure: string};

interface Task {
  id: number;
  message: WorkerRequest;
  resolve: (value: RenderOutcome | Uint8Array) => void;
  reject: (error: Error) => void;
}

interface Slot {
  worker: Worker;
  ready: boolean;
  task?: Task;
  timer?: ReturnType<typeof setTimeout>;
}

export class RenderPool implements ImageRenderer {
  private readonly limits: ServiceLimits;
  private readonly slots: Slot[] = [];
  private readonly queue: Task[] = [];
  private nextId = 1;
  private closed = false;

  constructor(private readonly options: PoolOptions) {
    this.limits = {...DEFAULT_SERVICE_LIMITS, ...options.limits};
  }

  render(job: RenderJob): Promise<RenderOutcome> {
    if (this.queue.length >= this.limits.maxQueue) {
      return Promise.resolve({ok: false, error: {status: 503, code: "busy", message: "the service is drawing too many charts at once: try again in a few seconds"}});
    }
    return this.enqueue({id: this.nextId++, job} as WorkerRequest) as Promise<RenderOutcome>;
  }

  rasterize(svg: string, scale: number): Promise<Uint8Array> {
    return this.enqueue({id: this.nextId++, raster: {svg, scale}}) as Promise<Uint8Array>;
  }

  /** Terminates the workers; pending renders fail. */
  async close(): Promise<void> {
    this.closed = true;
    for (const task of this.queue.splice(0)) task.reject(new Error("the render pool is closed"));
    await Promise.all(this.slots.splice(0).map((slot) => slot.worker.terminate()));
  }

  private enqueue(message: WorkerRequest): Promise<RenderOutcome | Uint8Array> {
    if (this.closed) return Promise.reject(new Error("the render pool is closed"));
    return new Promise((resolve, reject) => {
      this.queue.push({id: message.id, message, resolve, reject});
      this.ensureWorkers();
      this.dispatch();
    });
  }

  private ensureWorkers(): void {
    const size = Math.max(1, this.options.size ?? 1);
    while (this.slots.length < size) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const worker = new Worker(this.options.workerUrl, {
      workerData: {limits: this.limits},
      // A chart that needs more memory than this is refused rather than taking the instance down.
      resourceLimits: {maxOldGenerationSizeMb: 512}
    });
    worker.unref();
    const slot: Slot = {worker, ready: false};
    worker.on("message", (message: WorkerResponse) => {
      if ("type" in message) {
        slot.ready = true;
        this.dispatch();
        return;
      }
      const task = slot.task;
      if (!task || task.id !== message.id) return;
      this.finish(slot);
      if ("outcome" in message) task.resolve(message.outcome);
      else if ("png" in message) task.resolve(message.png);
      else task.reject(new Error(message.failure));
      this.dispatch();
    });
    worker.on("error", (error: unknown) => this.replace(slot, {status: 422, code: "render-failed", message: `the chart could not be drawn: ${error instanceof Error ? error.message : String(error)}`}));
    worker.on("exit", () => this.replace(slot, {status: 500, code: "render-failed", message: "the renderer stopped while drawing the chart"}));
    return slot;
  }

  private finish(slot: Slot): void {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = undefined;
    slot.task = undefined;
  }

  /** Ends the slot's worker and its task, and puts a new worker in its place. */
  private replace(slot: Slot, error: {status: number; code: string; message: string}): void {
    const index = this.slots.indexOf(slot);
    if (index < 0) return; // already replaced
    this.slots.splice(index, 1);
    const task = slot.task;
    this.finish(slot);
    void slot.worker.terminate();
    const fail = (t: Task, e: typeof error) => ("job" in t.message ? t.resolve({ok: false, error: e}) : t.reject(new Error(e.message)));
    if (task) fail(task, error);
    if (!slot.ready) {
      // The worker died before it could draw anything (a missing file, a broken install): do not loop.
      for (const t of this.queue.splice(0)) fail(t, {status: 500, code: "renderer-unavailable", message: "the renderer could not start"});
      return;
    }
    if (!this.closed && this.queue.length) {
      this.ensureWorkers();
      this.dispatch();
    }
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (!slot.ready || slot.task || this.queue.length === 0) continue;
      const task = this.queue.shift()!;
      slot.task = task;
      slot.timer = setTimeout(() => {
        this.replace(slot, {status: 422, code: "render-timeout", message: `the chart took longer than ${this.limits.renderTimeout / 1000} s to draw: draw fewer marks or rows`});
      }, this.limits.renderTimeout);
      slot.timer.unref?.();
      slot.worker.postMessage(task.message);
    }
  }
}
