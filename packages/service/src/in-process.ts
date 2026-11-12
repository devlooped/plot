import {DEFAULT_SERVICE_LIMITS, type ServiceLimits} from "./limits.js";
import {rasterize} from "./raster.js";
import {renderImage} from "./render.js";
import type {ImageRenderer} from "./service.js";

/** A renderer that draws in the calling thread: no time limit, so for tests and trusted input only. */
export function createInProcessRenderer(limits: Partial<ServiceLimits> = {}): ImageRenderer {
  const all = {...DEFAULT_SERVICE_LIMITS, ...limits};
  return {
    render: async (job) => renderImage(job, rasterize, all),
    rasterize: async (svg, scale) => rasterize(svg, scale)
  };
}
