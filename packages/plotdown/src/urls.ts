// The URL rules: links (href) and remote content (data URLs, images).
import {fail, type PathSegment} from "./errors.js";
import type {AllowRemote} from "./types.js";

// Browsers ignore ASCII whitespace and control characters inside a scheme ("java\tscript:").
const IGNORED = /[\u0000-\u0020\u007f-\u009f]/g;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** The scheme of a URL in lower case, or undefined for a relative URL. */
export function urlScheme(url: string): string | undefined {
  const m = SCHEME.exec(url.replace(IGNORED, ""));
  return m ? m[1]!.toLowerCase() : undefined;
}

/** Whether a link may be used as an href: http, https, mailto or relative. */
export function isSafeHref(url: string): boolean {
  const scheme = urlScheme(url);
  return scheme === undefined || scheme === "http" || scheme === "https" || scheme === "mailto";
}

/** Whether a URL is an inline image (data:image/…), which needs no network. */
export function isInlineImage(url: string): boolean {
  return /^data:image\/[a-z0-9.+-]+[;,]/i.test(url.replace(IGNORED, ""));
}

export interface RemotePolicy {
  allowRemote: AllowRemote;
  baseUrl: string | URL | undefined;
}

/**
 * Checks that a remote URL (data or image) may be loaded under the host's policy
 * and returns it resolved against baseUrl (or as is when relative with no base).
 */
export function checkRemote(url: string, policy: RemotePolicy, path: readonly PathSegment[], what: string): string {
  if (!policy.allowRemote) {
    fail(path, `${what} "${url}" would load from the network, which this host does not allow (allowRemote is false)`);
  }
  const scheme = urlScheme(url);
  if (scheme !== undefined && scheme !== "http" && scheme !== "https") {
    fail(path, `${what} "${url}" must be an http or https URL`);
  }
  let resolved: URL | undefined;
  try {
    resolved = scheme !== undefined || policy.baseUrl !== undefined ? new URL(url, policy.baseUrl) : undefined;
  } catch {
    fail(path, `${what} "${url}" is not a valid URL`);
  }
  if (resolved && resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    fail(path, `${what} "${url}" must be an http or https URL`);
  }
  if (Array.isArray(policy.allowRemote)) {
    if (!resolved) fail(path, `${what} "${url}" is relative; a list of allowed origins needs a baseUrl to resolve it`);
    const origins = policy.allowRemote.map(normalizeOrigin);
    if (!origins.includes(resolved.origin)) {
      fail(path, `${what} "${url}" is not from an allowed origin (${origins.join(", ") || "none"})`);
    }
  }
  return resolved ? resolved.href : url;
}

export function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}

/** Plot's own rule for a constant image src: a path (./, ../, /) or a URL with a scheme. */
export function isConstantSrc(value: string): boolean {
  return /^\.*\//.test(value) || /^(blob|data|file|http|https):/i.test(value);
}
