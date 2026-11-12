/// <reference types="node" />
// The Vercel function: `export {default} from "@devlooped/plotdown-service/vercel"`
// in api/plotdown.ts, with the rewrites of vercel.json sending /svg, /png and
// /api/health to it (the function sees the original URL).
//
// Rate limiting: before each render (never for an answer from the CDN cache,
// which does not reach the function), the function asks the Vercel Firewall
// for the rate limit rule named PLOTDOWN_RATE_LIMIT_ID ("plotdown-render" by
// default), counted per client IP. Without that rule, or outside Vercel, every
// request passes, and the service's own limits (size, time, pixels, queue)
// still hold.
import {checkRateLimit} from "@vercel/firewall";
import {createNodeService} from "./node.js";

async function rateLimit(request: Request): Promise<boolean> {
  if (process.env.VERCEL !== "1") return false;
  const id = process.env.PLOTDOWN_RATE_LIMIT_ID ?? "plotdown-render";
  if (!id || id === "off") return false;
  try {
    const {rateLimited} = await checkRateLimit(id, {request, timeout: 1000});
    return rateLimited;
  } catch (error) {
    // A firewall that does not answer must not take the service down with it.
    console.warn(`rate limit check failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

const {handle} = createNodeService({rateLimit});

export default {fetch: handle};
