// plotdown/link: a plot block as an image link of the plotdown.cc service, and
// back. Runs in Node, in browsers and in workers: it imports nothing.
//
//   https://plotdown.cc/svg/pako:eNqrVkrLz1eyUkpKLFKqBQA…           → image/svg+xml
//   https://plotdown.cc/png/pako:eNqrVkrLz1eyUkpKLFKqBQA…?scale=2   → image/png
//
// `pako:` is the encoding of mermaid.ink and Kroki: the block's UTF-8 text,
// compressed as a zlib stream, then written in base64url without padding.
import {InflateError, zlibCompress, zlibDecompress} from "./zlib.js";

export {InflateError} from "./zlib.js";

/** The public service. Self-hosted services pass their own base URL. */
export const DEFAULT_SERVICE_URL = "https://plotdown.cc";

/**
 * The longest link made by default, in characters. RFC 9110 asks for at least
 * 8,000 octets of request line; Vercel's CDN, in front of plotdown.cc, stops at
 * 14 KB (Cloudflare at 16 KB), and image proxies (GitHub's camo writes the URL
 * again in hex in its own) and chat apps lower it further. A block whose
 * link would be longer is too big for a link: commit an SVG file instead
 * (`plotdown render`) or POST the block to the service.
 */
export const MAX_LINK_LENGTH = 8000;

/** The prefix of the encoded block in a link. */
export const ENCODING_PREFIX = "pako:";

export type ImageFormat = "svg" | "png";
/** auto follows the reader's color scheme (SVG only: a PNG cannot); light and dark fix the colors. */
export type ImageTheme = "auto" | "light" | "dark";

/** The PNG scales the service draws: every other value would be one more cache entry for the same chart. */
export const PNG_SCALES: readonly number[] = Object.freeze([1, 2, 3, 4]);

/** The options of an image, as they go in the query of a link. */
export interface ImageOptions {
  /** SVG: auto (default), light or dark. PNG: light (default) or dark. */
  theme?: ImageTheme;
  /** PNG only: 1 (default), 2, 3 or 4 device pixels per CSS pixel. */
  scale?: number;
}

export interface ImageLinkOptions extends ImageOptions {
  /** svg (default) or png. */
  format?: ImageFormat;
  /** The service, https://plotdown.cc by default. */
  baseUrl?: string;
  /** The longest link to make; MAX_LINK_LENGTH by default. */
  maxLength?: number;
}

/** A link that would be longer than the limit. Nothing is truncated: the block does not fit in a link. */
export class LinkTooLongError extends RangeError {
  override readonly name = "LinkTooLongError";
  constructor(
    readonly length: number,
    readonly maxLength: number
  ) {
    super(
      `the image link would be ${length} characters long, over the limit of ${maxLength}: ` +
        "commit the chart as an SVG file (plotdown render) or send the block in a POST request"
    );
  }
}

/** Image options that the service does not take. */
export class ImageOptionsError extends RangeError {
  override readonly name = "ImageOptionsError";
}

/**
 * The text of a block as it goes in a link: without a byte order mark, with
 * LF line endings, without leading or trailing whitespace. These changes never
 * change the chart, and make the same block give the same link whether it was
 * read from a CRLF file, a Markdown fence or an editor. Whitespace inside the
 * JSON is kept: the SVG names its ids after the text, so minifying would give
 * an SVG whose bytes differ from those `plotdown render` writes for the block.
 */
export function canonicalBlock(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
}

/** The block's canonical text, compressed and encoded: `pako:…`. */
export function encodeBlock(text: string): string {
  return ENCODING_PREFIX + base64UrlEncode(zlibCompress(new TextEncoder().encode(canonicalBlock(text))));
}

export interface DecodeOptions {
  /** The longest decoded text, in UTF-8 bytes; 524,288 by default. Inflating stops as soon as it is passed. */
  maxBytes?: number;
}

/**
 * The text of an encoded block (`pako:…`, the prefix being optional). Throws an
 * InflateError: reason "invalid" for anything that is not base64url of a zlib
 * stream of UTF-8 text, "too-large" when the text passes maxBytes.
 */
export function decodeBlock(encoded: string, options: DecodeOptions = {}): string {
  const data = encoded.startsWith(ENCODING_PREFIX) ? encoded.slice(ENCODING_PREFIX.length) : encoded;
  const bytes = base64UrlDecode(data);
  const text = zlibDecompress(bytes, options.maxBytes ?? 512 * 1024);
  try {
    return new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(text);
  } catch {
    throw new InflateError("invalid", "the block is not UTF-8 text");
  }
}

/**
 * Checks the options of an image as the service does, and returns them without
 * the defaults (theme auto for SVG and light for PNG, scale 1): an option set to
 * its default does not change the image, so it is not written in the link.
 */
export function normalizeImageOptions(format: ImageFormat, options: ImageOptions = {}): ImageOptions {
  const result: ImageOptions = {};
  const {theme, scale} = options;
  if (theme !== undefined) {
    if (theme !== "auto" && theme !== "light" && theme !== "dark") throw new ImageOptionsError(`unknown theme "${String(theme)}": use auto, light or dark`);
    if (format === "png" && theme === "auto") throw new ImageOptionsError("a PNG cannot follow the reader's color scheme: use theme light or dark");
    if (theme !== (format === "png" ? "light" : "auto")) result.theme = theme;
  }
  if (scale !== undefined) {
    if (format !== "png") throw new ImageOptionsError("scale applies to PNG images only");
    if (!PNG_SCALES.includes(scale)) throw new ImageOptionsError(`unknown scale ${String(scale)}: use ${PNG_SCALES.join(", ")}`);
    if (scale !== 1) result.scale = scale;
  }
  return result;
}

/** The query of an image link: the options that differ from the defaults, in a fixed order. */
export function imageQuery(format: ImageFormat, options: ImageOptions = {}): string {
  const normalized = normalizeImageOptions(format, options);
  const parts: string[] = [];
  if (normalized.theme) parts.push(`theme=${normalized.theme}`);
  if (normalized.scale) parts.push(`scale=${normalized.scale}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * The image link of a block (its text, or a parsed object written as JSON).
 * Throws a LinkTooLongError when the link would be longer than maxLength, and
 * an ImageOptionsError for options the service does not take. The block is not
 * validated: render it first (the service answers 400 for an invalid block).
 */
export function imageLink(source: string | object, options: ImageLinkOptions = {}): string {
  const format = options.format ?? "svg";
  if (format !== "svg" && format !== "png") throw new ImageOptionsError(`unknown format "${String(format)}": use svg or png`);
  const text = typeof source === "string" ? source : JSON.stringify(source, null, 2);
  const base = (options.baseUrl ?? DEFAULT_SERVICE_URL).replace(/\/+$/, "");
  const url = `${base}/${format}/${encodeBlock(text)}${imageQuery(format, options)}`;
  const maxLength = options.maxLength ?? MAX_LINK_LENGTH;
  if (url.length > maxLength) throw new LinkTooLongError(url.length, maxLength);
  return url;
}

/** What an image link holds. */
export interface ParsedImageLink extends ImageOptions {
  format: ImageFormat;
  /** The text of the block. */
  block: string;
  /** The service: the link's origin and the path before /svg or /png. */
  baseUrl: string;
}

/** Reads an image link back: its format, its block and its options. Throws on a link of another kind. */
export function parseImageLink(link: string, options: DecodeOptions = {}): ParsedImageLink {
  const url = new URL(link);
  const match = /^(.*)\/(svg|png)\/([^/]+)$/.exec(url.pathname);
  if (!match || !match[3]!.startsWith(ENCODING_PREFIX)) throw new ImageOptionsError(`not a plotdown image link: ${link}`);
  const format = match[2] as ImageFormat;
  const theme = url.searchParams.get("theme");
  const scale = url.searchParams.get("scale");
  const normalized = normalizeImageOptions(format, {
    theme: theme === null ? undefined : (theme as ImageTheme),
    scale: scale === null ? undefined : Number(scale)
  });
  return {format, block: decodeBlock(decodeURIComponent(match[3]!), options), baseUrl: url.origin + match[1], ...normalized};
}

/** A Markdown image of a link: `![alt](url)`. */
export function markdownImage(url: string, alt = "Chart"): string {
  const text = alt.replace(/\s+/g, " ").trim().replace(/[\\[\]]/g, (c) => `\\${c}`);
  return `![${text}](${url.replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)})`;
}

// ------------------------------------------------------------------- base64url

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const VALUES = (() => {
  const values = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) values[ALPHABET.charCodeAt(i)] = i;
  return values;
})();

/** base64url (RFC 4648, section 5) without padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += ALPHABET[n >>> 18]! + ALPHABET[(n >>> 12) & 63]! + ALPHABET[(n >>> 6) & 63]! + ALPHABET[n & 63]!;
  }
  if (i < bytes.length) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += ALPHABET[n >>> 18]! + ALPHABET[(n >>> 12) & 63]!;
    if (i + 1 < bytes.length) out += ALPHABET[(n >>> 6) & 63]!;
  }
  return out;
}

/** Reads base64url, with or without padding. Throws an InflateError on any other character. */
export function base64UrlDecode(text: string): Uint8Array {
  const data = text.replace(/=+$/, "");
  if (data.length % 4 === 1) throw new InflateError("invalid", "invalid base64url: wrong length");
  const out = new Uint8Array(Math.floor((data.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    const value = code < 128 ? VALUES[code]! : -1;
    if (value < 0) throw new InflateError("invalid", `invalid base64url: unexpected "${data[i]}" at ${i}`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >>> bits) & 0xff;
    }
  }
  return out;
}
