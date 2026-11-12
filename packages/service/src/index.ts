// The plotdown.cc image service as a library: createService turns a Request
// into a Response with any ImageRenderer; createNodeService runs it in Node
// with worker threads; createInProcessRenderer draws in the calling thread
// (no time limit: for tests and trusted input).
export {createService, type Handler, type ImageRenderer, type ServiceOptions} from "./service.js";
export {createNodeService, rendererId, type NodeServiceOptions} from "./node.js";
export {RenderPool, type PoolOptions} from "./pool.js";
export {DEFAULT_SERVICE_LIMITS, type ServiceLimits} from "./limits.js";
export {renderImage, createDocument, type ImageFormat, type RenderJob, type RenderOutcome, type ServiceErrorInfo} from "./render.js";
export {rasterize, FONT_FILES} from "./raster.js";
export {errorSvg} from "./errors.js";
export {createInProcessRenderer} from "./in-process.js";
