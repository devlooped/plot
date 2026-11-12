import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import zlib from "node:zlib";
import {describe, expect, it} from "vitest";
import {
  DEFAULT_SERVICE_URL,
  ImageOptionsError,
  InflateError,
  LinkTooLongError,
  MAX_LINK_LENGTH,
  base64UrlDecode,
  base64UrlEncode,
  canonicalBlock,
  decodeBlock,
  encodeBlock,
  imageLink,
  markdownImage,
  normalizeImageOptions,
  parseImageLink
} from "../src/link/index.js";
import {zlibCompress, zlibDecompress} from "../src/link/zlib.js";
import {fixtureNames, readFixture} from "./helpers.js";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("zlib", () => {
  const samples = [
    new Uint8Array(0),
    bytes("a"),
    bytes("ab"),
    bytes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    new Uint8Array(70_000).map((_, i) => (i * 7) % 13),
    new Uint8Array(5_000).map((_, i) => (i * 2654435761) >>> 24),
    new Uint8Array(300).fill(0),
    bytes("héllo wörld, 图表 📈 ".repeat(50))
  ];

  it("compresses what zlib inflates", () => {
    for (const data of samples) expect(new Uint8Array(zlib.inflateSync(zlibCompress(data)))).toEqual(data);
    for (const name of fixtureNames()) {
      const data = bytes(readFixture(name));
      expect(new Uint8Array(zlib.inflateSync(zlibCompress(data))), name).toEqual(data);
    }
  });

  it("inflates what zlib compresses, at every level and strategy", () => {
    for (const data of samples) {
      for (const level of [0, 1, 6, 9]) expect(zlibDecompress(new Uint8Array(zlib.deflateSync(data, {level})), 1 << 20)).toEqual(data);
      expect(zlibDecompress(new Uint8Array(zlib.deflateSync(data, {strategy: zlib.constants.Z_FIXED})), 1 << 20)).toEqual(data);
      expect(zlibDecompress(new Uint8Array(zlib.deflateSync(data, {strategy: zlib.constants.Z_HUFFMAN_ONLY})), 1 << 20)).toEqual(data);
    }
  });

  it("compresses JSON about as well as zlib does", () => {
    for (const name of fixtureNames()) {
      const data = bytes(readFixture(name));
      expect(zlibCompress(data).length, name).toBeLessThanOrEqual(Math.ceil(zlib.deflateSync(data, {level: 9}).length * 1.06) + 8);
    }
  });

  it("stops inflating as soon as the output passes the limit: a zip bomb costs nothing", () => {
    const bomb = new Uint8Array(zlib.deflateSync(new Uint8Array(64 * 1024 * 1024), {level: 9}));
    expect(bomb.length).toBeLessThan(100_000);
    const start = performance.now();
    expect(() => zlibDecompress(bomb, 256 * 1024)).toThrow(expect.objectContaining({reason: "too-large"}));
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("refuses what is not a zlib stream", () => {
    const good = zlibCompress(bytes('{"marks": []}'));
    const corrupt = good.slice();
    corrupt[corrupt.length - 1]! ^= 0xff;
    for (const input of [new Uint8Array(0), bytes("not zlib at all"), good.subarray(0, good.length - 3), corrupt]) {
      expect(() => zlibDecompress(input, 1 << 20)).toThrow(InflateError);
    }
  });
});

describe("base64url", () => {
  it("writes base64url without padding, and reads it with or without", () => {
    for (let length = 0; length < 20; length++) {
      const data = new Uint8Array(length).map((_, i) => (i * 97 + 251) & 255);
      const encoded = base64UrlEncode(data);
      expect(encoded).toBe(Buffer.from(data).toString("base64url"));
      expect(base64UrlDecode(encoded)).toEqual(data);
      expect(base64UrlDecode(Buffer.from(data).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"))).toEqual(data);
    }
    expect(() => base64UrlDecode("ab+c")).toThrow(InflateError);
    expect(() => base64UrlDecode("abcde")).toThrow(InflateError);
  });
});

describe("encodeBlock", () => {
  it("gives the same link for the same block, whatever its line endings, BOM or outer whitespace", () => {
    const block = '{\n  "marks": [{"mark": "barY", "data": [1, 2, 3]}]\n}';
    const encoded = encodeBlock(block);
    expect(encoded.startsWith("pako:eN")).toBe(true);
    expect(encodeBlock(block.replace(/\n/g, "\r\n"))).toBe(encoded);
    expect(encodeBlock(`﻿${block}\n\n`)).toBe(encoded);
    expect(encodeBlock(`  ${block}`)).toBe(encoded);
    expect(encodeBlock(block.replace("[1, 2, 3]", "[1,2,3]"))).not.toBe(encoded); // inner whitespace stays: it names the SVG's ids
    expect(canonicalBlock("﻿ {\r\n}\r\n")).toBe("{\n}");
  });

  it("decodes what it encodes, the prefix being optional", () => {
    for (const name of fixtureNames()) {
      const text = canonicalBlock(readFixture(name));
      const encoded = encodeBlock(text);
      expect(decodeBlock(encoded)).toBe(text);
      expect(decodeBlock(encoded.slice("pako:".length))).toBe(text);
    }
  });

  it("reads Kroki and mermaid.ink style encodings made with zlib", () => {
    const text = '{"marks": [{"mark": "dot", "data": [[1, 2]]}]}';
    expect(decodeBlock(`pako:${zlib.deflateSync(text, {level: 9}).toString("base64url")}`)).toBe(text);
  });

  it("refuses text that is not UTF-8, and text past the limit", () => {
    const latin1 = `pako:${zlib.deflateSync(Buffer.from([0x7b, 0xe9, 0x7d])).toString("base64url")}`;
    expect(() => decodeBlock(latin1)).toThrow(/UTF-8/);
    expect(() => decodeBlock(encodeBlock("x".repeat(2000)), {maxBytes: 1000})).toThrow(expect.objectContaining({reason: "too-large"}));
  });
});

describe("imageLink", () => {
  const block = '{"title": "Bars", "marks": [{"mark": "barY", "data": [1, 2, 3]}]}';

  it("writes SVG and PNG links of plotdown.cc, with the options that differ from the defaults", () => {
    expect(imageLink(block)).toBe(`${DEFAULT_SERVICE_URL}/svg/${encodeBlock(block)}`);
    expect(imageLink(block, {format: "png", scale: 2, theme: "dark"})).toBe(`${DEFAULT_SERVICE_URL}/png/${encodeBlock(block)}?theme=dark&scale=2`);
    expect(imageLink(block, {format: "png", scale: 1, theme: "light"})).toBe(imageLink(block, {format: "png"}));
    expect(imageLink(block, {theme: "auto"})).toBe(imageLink(block));
    expect(imageLink(block, {baseUrl: "http://localhost:3000/plots/"})).toBe(`http://localhost:3000/plots/svg/${encodeBlock(block)}`);
    expect(imageLink(JSON.parse(block))).toBe(imageLink(JSON.stringify(JSON.parse(block), null, 2)));
  });

  it("refuses options the service does not take", () => {
    expect(() => imageLink(block, {format: "png", theme: "auto"})).toThrow(ImageOptionsError);
    expect(() => imageLink(block, {scale: 2})).toThrow(/PNG images only/);
    expect(() => imageLink(block, {format: "png", scale: 1.5})).toThrow(/unknown scale/);
    expect(() => imageLink(block, {format: "gif" as never})).toThrow(/unknown format/);
    expect(normalizeImageOptions("png", {theme: "dark", scale: 4})).toEqual({theme: "dark", scale: 4});
  });

  it("reports a link that would be too long, and never truncates it", () => {
    const rows = Array.from({length: 3000}, (_, i) => ({x: i, y: (i * 7919) % 1000, z: `item-${(i * 104729) % 9973}`}));
    const big = JSON.stringify({marks: [{mark: "dot", data: rows, x: "x", y: "y", fill: "z"}]});
    let error: unknown;
    try {
      imageLink(big);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LinkTooLongError);
    expect((error as LinkTooLongError).length).toBeGreaterThan(MAX_LINK_LENGTH);
    expect((error as LinkTooLongError).message).toMatch(/plotdown render/);
    expect(imageLink(big, {maxLength: 1_000_000}).length).toBe((error as LinkTooLongError).length);
  });

  it("reads a link back", () => {
    const link = imageLink(block, {format: "png", scale: 3, baseUrl: "https://charts.example.com/x"});
    expect(parseImageLink(link)).toEqual({format: "png", scale: 3, block, baseUrl: "https://charts.example.com/x"});
    expect(() => parseImageLink("https://plotdown.cc/playground")).toThrow(ImageOptionsError);
  });

  it("writes a Markdown image", () => {
    expect(markdownImage("https://plotdown.cc/svg/pako:abc", "A [chart]\n")).toBe("![A \\[chart\\]](https://plotdown.cc/svg/pako:abc)");
  });
});

describe("the link module", () => {
  it("imports nothing, so that browsers, workers and Node load it alike", () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/link");
    for (const file of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      const imports = Array.from(text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g), (m) => m[1]!);
      expect(imports.every((s) => s.startsWith("./")), file).toBe(true);
    }
  });
});
