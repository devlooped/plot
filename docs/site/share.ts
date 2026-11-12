// A block in a URL: zlib deflate, then base64url, after "pako:" — the encoding
// of mermaid.ink and Kroki, and of the plotdown.cc image service
// (https://plotdown.cc/svg/pako:…), so that one token serves both.

export const PREFIX = "pako:";

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const response = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The token of a block: "pako:" and the base64url of its zlib-deflated UTF-8 text. */
export async function encodeSpec(text: string): Promise<string> {
  return PREFIX + toBase64Url(await pipe(new TextEncoder().encode(text), new CompressionStream("deflate")));
}

/** The text of a block from its token. Throws on a token that is not one. */
export async function decodeSpec(token: string): Promise<string> {
  if (!token.startsWith(PREFIX)) throw new Error("not a pako: token");
  return new TextDecoder("utf-8", {fatal: true}).decode(await pipe(fromBase64Url(token.slice(PREFIX.length)), new DecompressionStream("deflate")));
}
