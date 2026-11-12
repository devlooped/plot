// A small, deterministic PNG encoder (RGBA, 8 bits per channel) in plain
// JavaScript: no Node built-in, no canvas, no CompressionStream (which is
// asynchronous). Deflate uses fixed Huffman codes and a greedy LZ77 search,
// which is enough for the flat colors of rasters and legend ramps.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; ) {
    const end = Math.min(i + 5552, bytes.length);
    for (; i < end; i++) {
      a += bytes[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

class BitWriter {
  private bytes: number[] = [];
  private bit = 0;
  private current = 0;

  /** Writes the low `length` bits of value, least significant first (deflate's order for extra bits). */
  bits(value: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.current |= ((value >>> i) & 1) << this.bit;
      if (++this.bit === 8) this.flushByte();
    }
  }

  /** Writes a Huffman code, most significant bit first. */
  code(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.current |= ((value >>> i) & 1) << this.bit;
      if (++this.bit === 8) this.flushByte();
    }
  }

  private flushByte(): void {
    this.bytes.push(this.current);
    this.current = 0;
    this.bit = 0;
  }

  finish(): number[] {
    if (this.bit > 0) this.flushByte();
    return this.bytes;
  }
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function writeLiteral(out: BitWriter, symbol: number): void {
  if (symbol < 144) out.code(0x30 + symbol, 8);
  else if (symbol < 256) out.code(0x190 + symbol - 144, 9);
  else if (symbol < 280) out.code(symbol - 256, 7);
  else out.code(0xc0 + symbol - 280, 8);
}

function lastIndexAtMost(table: readonly number[], value: number): number {
  let i = table.length - 1;
  while (table[i]! > value) i--;
  return i;
}

function writeMatch(out: BitWriter, length: number, distance: number): void {
  const li = lastIndexAtMost(LENGTH_BASE, length);
  writeLiteral(out, 257 + li);
  out.bits(length - LENGTH_BASE[li]!, LENGTH_EXTRA[li]!);
  const di = lastIndexAtMost(DIST_BASE, distance);
  out.code(di, 5);
  out.bits(distance - DIST_BASE[di]!, DIST_EXTRA[di]!);
}

const WINDOW = 32768;
const MAX_CHAIN = 32;
const HASH_SIZE = 1 << 15;

/** zlib-wrapped deflate (RFC 1950, 1951) with one block of fixed Huffman codes. */
export function zlibDeflate(data: Uint8Array): Uint8Array {
  const out = new BitWriter();
  out.bits(1, 1); // BFINAL
  out.bits(1, 2); // BTYPE = fixed Huffman
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(data.length).fill(-1);
  const hash = (i: number) => ((data[i]! << 10) ^ (data[i + 1]! << 5) ^ data[i + 2]!) & (HASH_SIZE - 1);
  const insert = (i: number) => {
    if (i + 2 >= data.length) return;
    const h = hash(i);
    prev[i] = head[h]!;
    head[h] = i;
  };
  let i = 0;
  while (i < data.length) {
    let bestLength = 0;
    let bestDistance = 0;
    if (i + 2 < data.length) {
      let candidate = head[hash(i)]!;
      const max = Math.min(258, data.length - i);
      for (let chain = 0; candidate >= 0 && i - candidate <= WINDOW && chain < MAX_CHAIN; chain++) {
        let length = 0;
        while (length < max && data[candidate + length] === data[i + length]) length++;
        if (length > bestLength) {
          bestLength = length;
          bestDistance = i - candidate;
          if (length === max) break;
        }
        candidate = prev[candidate]!;
      }
    }
    if (bestLength >= 3) {
      writeMatch(out, bestLength, bestDistance);
      for (let k = 0; k < bestLength; k++) insert(i + k);
      i += bestLength;
    } else {
      writeLiteral(out, data[i]!);
      insert(i);
      i++;
    }
  }
  writeLiteral(out, 256);
  const body = out.finish();
  const result = new Uint8Array(2 + body.length + 4);
  result[0] = 0x78;
  result[1] = 0x01;
  result.set(body, 2);
  const adler = adler32(data);
  const end = result.length;
  result[end - 4] = adler >>> 24;
  result[end - 3] = (adler >>> 16) & 0xff;
  result[end - 2] = (adler >>> 8) & 0xff;
  result[end - 1] = adler & 0xff;
  return result;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** Encodes RGBA pixels (non-premultiplied, row by row) as a PNG file. */
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // color type: RGBA
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlibDeflate(raw)),
    chunk("IEND", new Uint8Array(0))
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 of bytes, without btoa or Buffer. */
export function base64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += BASE64[n >>> 18]! + BASE64[(n >>> 12) & 63]! + BASE64[(n >>> 6) & 63]! + BASE64[n & 63]!;
  }
  if (i < bytes.length) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += BASE64[n >>> 18]! + BASE64[(n >>> 12) & 63]! + (i + 1 < bytes.length ? BASE64[(n >>> 6) & 63]! : "=") + "=";
  }
  return out;
}
