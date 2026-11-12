// zlib (RFC 1950) around deflate (RFC 1951), in plain JavaScript: no Node
// built-in, no CompressionStream (asynchronous, and its bytes differ from one
// browser's zlib to another's). The same text gives the same bytes in Node, in
// browsers and in workers, so that the same chart gives the same link wherever
// the link is made.
//
// The compressor writes one block with dynamic Huffman codes after a hash-chain
// LZ77 search with lazy matching. The decompressor reads any zlib stream and
// stops as soon as the output passes a limit, so that a small input that
// inflates to gigabytes (a zip bomb) costs nothing.

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** The order in which the lengths of the code length code are written. */
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

export function adler32(bytes: Uint8Array): number {
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

// ---------------------------------------------------------------- compression

class BitWriter {
  private bytes: number[] = [];
  private bit = 0;
  private current = 0;

  /** The low `length` bits of value, least significant first (extra bits, header fields). */
  bits(value: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.current |= ((value >>> i) & 1) << this.bit;
      if (++this.bit === 8) this.flush();
    }
  }

  /** A Huffman code, most significant bit first. */
  code(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.current |= ((value >>> i) & 1) << this.bit;
      if (++this.bit === 8) this.flush();
    }
  }

  private flush(): void {
    this.bytes.push(this.current);
    this.current = 0;
    this.bit = 0;
  }

  finish(): number[] {
    if (this.bit > 0) this.flush();
    return this.bytes;
  }
}

/**
 * Code lengths of a Huffman code for the frequencies, none longer than maxBits.
 * Ties are broken by symbol, so that the result is the same everywhere. When a
 * code is too long, the frequencies are flattened and the code built again.
 */
function codeLengths(frequencies: readonly number[], maxBits: number): number[] {
  const lengths = new Array<number>(frequencies.length).fill(0);
  let weights = frequencies.slice();
  for (;;) {
    const used = weights.map((w, s) => (w > 0 ? s : -1)).filter((s) => s >= 0);
    if (used.length === 0) return lengths;
    if (used.length === 1) {
      // A code needs two symbols to be complete: give the lone one a partner.
      const partner = used[0] === 0 ? 1 : 0;
      lengths[used[0]!] = 1;
      lengths[partner] = 1;
      return lengths;
    }
    interface Node {
      weight: number;
      order: number;
      symbol?: number;
      left?: Node;
      right?: Node;
    }
    let queue: Node[] = used.map((symbol, i) => ({weight: weights[symbol]!, order: i, symbol}));
    let order = queue.length;
    const byWeight = (a: Node, b: Node) => a.weight - b.weight || a.order - b.order;
    queue.sort(byWeight);
    while (queue.length > 1) {
      const [a, b] = queue as [Node, Node];
      const node: Node = {weight: a.weight + b.weight, order: order++, left: a, right: b};
      queue = queue.slice(2);
      // Insert in order (the queue is short: at most 286 symbols).
      let at = queue.findIndex((n) => byWeight(node, n) < 0);
      if (at < 0) at = queue.length;
      queue.splice(at, 0, node);
    }
    let longest = 0;
    const depths: [number, number][] = [];
    const walk = (node: Node, depth: number) => {
      if (node.symbol !== undefined) {
        depths.push([node.symbol, depth]);
        longest = Math.max(longest, depth);
      } else {
        walk(node.left!, depth + 1);
        walk(node.right!, depth + 1);
      }
    };
    walk(queue[0]!, 0);
    if (longest <= maxBits) {
      for (const [symbol, depth] of depths) lengths[symbol] = depth;
      return lengths;
    }
    weights = weights.map((w) => (w > 0 ? Math.max(1, w >>> 1) : 0));
  }
}

/** The canonical codes of a set of code lengths (RFC 1951, 3.2.2). */
function canonicalCodes(lengths: readonly number[]): number[] {
  const maxBits = Math.max(0, ...lengths);
  const count = new Array<number>(maxBits + 1).fill(0);
  for (const length of lengths) if (length) count[length]!++;
  const next = new Array<number>(maxBits + 2).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    code = (code + count[bits - 1]!) << 1;
    next[bits] = code;
  }
  return lengths.map((length) => (length ? next[length]!++ : 0));
}

function lastIndexAtMost(table: readonly number[], value: number): number {
  let i = table.length - 1;
  while (table[i]! > value) i--;
  return i;
}

const WINDOW = 32768;
const MAX_CHAIN = 256;
const NICE_LENGTH = 128;
const HASH_BITS = 15;

/** LZ77 tokens: a literal byte is a number below 256; a match is length << 16 | distance, with length ≥ 3. */
function lz77(data: Uint8Array): number[] {
  const tokens: number[] = [];
  const head = new Int32Array(1 << HASH_BITS).fill(-1);
  const prev = new Int32Array(data.length).fill(-1);
  const hash = (i: number) => ((data[i]! << 10) ^ (data[i + 1]! << 5) ^ data[i + 2]!) & ((1 << HASH_BITS) - 1);
  let inserted = 0;
  const insertUpTo = (end: number) => {
    for (; inserted < end; inserted++) {
      if (inserted + 2 >= data.length) continue;
      const h = hash(inserted);
      prev[inserted] = head[h]!;
      head[h] = inserted;
    }
  };
  const longestMatch = (i: number): [number, number] => {
    if (i + 2 >= data.length) return [0, 0];
    insertUpTo(i);
    let bestLength = 0;
    let bestDistance = 0;
    const max = Math.min(258, data.length - i);
    let candidate = head[hash(i)]!;
    for (let chain = 0; candidate >= 0 && i - candidate <= WINDOW && chain < MAX_CHAIN; chain++) {
      if (data[candidate + bestLength] === data[i + bestLength]) {
        let length = 0;
        while (length < max && data[candidate + length] === data[i + length]) length++;
        if (length > bestLength) {
          bestLength = length;
          bestDistance = i - candidate;
          if (length >= NICE_LENGTH || length === max) break;
        }
      }
      candidate = prev[candidate]!;
    }
    return bestLength >= 3 ? [bestLength, bestDistance] : [0, 0];
  };
  let i = 0;
  let pending = longestMatch(0);
  while (i < data.length) {
    const [length, distance] = pending;
    if (length === 0) {
      tokens.push(data[i]!);
      i++;
      pending = longestMatch(i);
      continue;
    }
    // Lazy matching: a longer match one byte later wins over this one.
    const next = length < NICE_LENGTH ? longestMatch(i + 1) : ([0, 0] as [number, number]);
    if (next[0] > length) {
      tokens.push(data[i]!);
      i++;
      pending = next;
      continue;
    }
    tokens.push((length << 16) | distance);
    i += length;
    pending = longestMatch(i);
  }
  return tokens;
}

/** Compresses bytes as a zlib stream (one deflate block with dynamic Huffman codes). */
export function zlibCompress(data: Uint8Array): Uint8Array {
  const tokens = lz77(data);
  const litFreq = new Array<number>(286).fill(0);
  const distFreq = new Array<number>(30).fill(0);
  for (const token of tokens) {
    if (token < 256) litFreq[token]!++;
    else {
      litFreq[257 + lastIndexAtMost(LENGTH_BASE, token >>> 16)]!++;
      distFreq[lastIndexAtMost(DIST_BASE, token & 0xffff)]!++;
    }
  }
  litFreq[256] = 1;
  const litLengths = codeLengths(litFreq, 15);
  const distLengths = codeLengths(distFreq, 15);
  if (!distLengths.some((l) => l > 0)) distLengths[0] = distLengths[1] = 1; // no match: a complete, unused code
  const litCodes = canonicalCodes(litLengths);
  const distCodes = canonicalCodes(distLengths);

  let hlit = 286;
  while (hlit > 257 && litLengths[hlit - 1] === 0) hlit--;
  let hdist = 30;
  while (hdist > 1 && distLengths[hdist - 1] === 0) hdist--;
  const all = [...litLengths.slice(0, hlit), ...distLengths.slice(0, hdist)];

  // Run-length code the lengths: 16 repeats the previous length 3-6 times, 17 and 18 write 3-10 and 11-138 zeros.
  const runs: [number, number, number][] = []; // symbol, extra value, extra bits
  for (let i = 0; i < all.length; ) {
    const length = all[i]!;
    let run = 1;
    while (i + run < all.length && all[i + run] === length) run++;
    if (length === 0 && run >= 3) {
      const n = Math.min(run, 138);
      runs.push(n >= 11 ? [18, n - 11, 7] : [17, n - 3, 3]);
      i += n;
    } else if (length !== 0 && run >= 4) {
      runs.push([length, 0, 0]);
      const n = Math.min(run - 1, 6);
      runs.push([16, n - 3, 2]);
      i += 1 + n;
    } else {
      runs.push([length, 0, 0]);
      i++;
    }
  }
  const clFreq = new Array<number>(19).fill(0);
  for (const [symbol] of runs) clFreq[symbol]!++;
  const clLengths = codeLengths(clFreq, 7);
  const clCodes = canonicalCodes(clLengths);
  let hclen = 19;
  while (hclen > 4 && clLengths[CL_ORDER[hclen - 1]!] === 0) hclen--;

  const out = new BitWriter();
  out.bits(1, 1); // BFINAL
  out.bits(2, 2); // BTYPE: dynamic Huffman codes
  out.bits(hlit - 257, 5);
  out.bits(hdist - 1, 5);
  out.bits(hclen - 4, 4);
  for (let i = 0; i < hclen; i++) out.bits(clLengths[CL_ORDER[i]!]!, 3);
  for (const [symbol, extra, bits] of runs) {
    out.code(clCodes[symbol]!, clLengths[symbol]!);
    if (bits) out.bits(extra, bits);
  }
  for (const token of tokens) {
    if (token < 256) {
      out.code(litCodes[token]!, litLengths[token]!);
      continue;
    }
    const length = token >>> 16;
    const distance = token & 0xffff;
    const li = lastIndexAtMost(LENGTH_BASE, length);
    out.code(litCodes[257 + li]!, litLengths[257 + li]!);
    out.bits(length - LENGTH_BASE[li]!, LENGTH_EXTRA[li]!);
    const di = lastIndexAtMost(DIST_BASE, distance);
    out.code(distCodes[di]!, distLengths[di]!);
    out.bits(distance - DIST_BASE[di]!, DIST_EXTRA[di]!);
  }
  out.code(litCodes[256]!, litLengths[256]!);
  const body = out.finish();

  const result = new Uint8Array(2 + body.length + 4);
  result[0] = 0x78; // deflate, 32 KiB window
  result[1] = 0xda; // best compression, and (0x78 << 8 | 0xda) % 31 === 0
  result.set(body, 2);
  const adler = adler32(data);
  const end = result.length;
  result[end - 4] = adler >>> 24;
  result[end - 3] = (adler >>> 16) & 0xff;
  result[end - 2] = (adler >>> 8) & 0xff;
  result[end - 1] = adler & 0xff;
  return result;
}

// -------------------------------------------------------------- decompression

/** Why a stream could not be inflated. */
export class InflateError extends Error {
  override readonly name = "InflateError";
  /** "invalid": not a zlib stream; "too-large": the output passes the limit. */
  readonly reason: "invalid" | "too-large";

  constructor(reason: "invalid" | "too-large", message: string) {
    super(message);
    this.reason = reason;
  }
}

interface Huffman {
  /** Number of codes of each length. */
  counts: Uint16Array;
  /** Symbols ordered by code. */
  symbols: Uint16Array;
}

function buildHuffman(lengths: ArrayLike<number>, offset: number, n: number): Huffman {
  const counts = new Uint16Array(16);
  for (let i = 0; i < n; i++) counts[lengths[offset + i]!]!++;
  counts[0] = 0;
  // Over-subscribed codes are invalid; incomplete ones are allowed (zlib allows a lone code).
  let left = 1;
  for (let bits = 1; bits < 16; bits++) {
    left = (left << 1) - counts[bits]!;
    if (left < 0) throw new InflateError("invalid", "invalid Huffman code: over-subscribed");
  }
  const offs = new Uint16Array(16);
  for (let bits = 1; bits < 15; bits++) offs[bits + 1] = offs[bits]! + counts[bits]!;
  const symbols = new Uint16Array(n);
  for (let symbol = 0; symbol < n; symbol++) {
    const length = lengths[offset + symbol]!;
    if (length) symbols[offs[length]!++] = symbol;
  }
  return {counts, symbols};
}

const FIXED = (() => {
  const lengths = new Uint8Array(288 + 30);
  lengths.fill(8, 0, 144);
  lengths.fill(9, 144, 256);
  lengths.fill(7, 256, 280);
  lengths.fill(8, 280, 288);
  lengths.fill(5, 288, 318);
  return {lit: buildHuffman(lengths, 0, 288), dist: buildHuffman(lengths, 288, 30)};
})();

/** Inflates a zlib stream; throws an InflateError when it is invalid or when its output would pass maxOutput bytes. */
export function zlibDecompress(input: Uint8Array, maxOutput: number): Uint8Array {
  if (input.length < 6) throw new InflateError("invalid", "not a zlib stream: too short");
  const cmf = input[0]!;
  const flg = input[1]!;
  if ((cmf & 0x0f) !== 8 || cmf >>> 4 > 7 || ((cmf << 8) | flg) % 31 !== 0) throw new InflateError("invalid", "not a zlib stream: bad header");
  if (flg & 0x20) throw new InflateError("invalid", "not a zlib stream: a preset dictionary is not supported");

  let pos = 2;
  let bitBuffer = 0;
  let bitCount = 0;
  let out = new Uint8Array(Math.min(maxOutput, Math.max(1024, input.length * 4)));
  let length = 0;

  const need = (n: number) => {
    while (bitCount < n) {
      if (pos >= input.length) throw new InflateError("invalid", "the zlib stream ends too early");
      bitBuffer |= input[pos++]! << bitCount;
      bitCount += 8;
    }
  };
  const bits = (n: number): number => {
    if (n === 0) return 0;
    need(n);
    const value = bitBuffer & ((1 << n) - 1);
    bitBuffer >>>= n;
    bitCount -= n;
    return value;
  };
  const reserve = (n: number) => {
    if (length + n > maxOutput) throw new InflateError("too-large", `the block inflates to more than ${maxOutput} bytes`);
    if (length + n <= out.length) return;
    const grown = new Uint8Array(Math.min(maxOutput, Math.max(out.length * 2, length + n)));
    grown.set(out.subarray(0, length));
    out = grown;
  };
  const decode = (h: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = h.counts[len]!;
      if (code - count < first) return h.symbols[index + (code - first)]!;
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new InflateError("invalid", "invalid Huffman code in the stream");
  };

  for (let last = 0; !last; ) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuffer = 0;
      bitCount = 0;
      if (pos + 4 > input.length) throw new InflateError("invalid", "the zlib stream ends too early");
      const len = input[pos]! | (input[pos + 1]! << 8);
      const nlen = input[pos + 2]! | (input[pos + 3]! << 8);
      pos += 4;
      if (len !== (~nlen & 0xffff)) throw new InflateError("invalid", "invalid stored block length");
      if (pos + len > input.length) throw new InflateError("invalid", "the zlib stream ends too early");
      reserve(len);
      out.set(input.subarray(pos, pos + len), length);
      length += len;
      pos += len;
      continue;
    }
    let lit: Huffman;
    let dist: Huffman;
    if (type === 1) {
      ({lit, dist} = FIXED);
    } else if (type === 2) {
      const nlen = bits(5) + 257;
      const ndist = bits(5) + 1;
      const ncode = bits(4) + 4;
      if (nlen > 286 || ndist > 30) throw new InflateError("invalid", "invalid code counts");
      const clLengths = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) clLengths[CL_ORDER[i]!] = bits(3);
      const cl = buildHuffman(clLengths, 0, 19);
      const lengths = new Uint8Array(nlen + ndist);
      for (let i = 0; i < nlen + ndist; ) {
        const symbol = decode(cl);
        if (symbol < 16) {
          lengths[i++] = symbol;
          continue;
        }
        let value = 0;
        let repeat: number;
        if (symbol === 16) {
          if (i === 0) throw new InflateError("invalid", "a repeated length with no previous length");
          value = lengths[i - 1]!;
          repeat = 3 + bits(2);
        } else if (symbol === 17) repeat = 3 + bits(3);
        else repeat = 11 + bits(7);
        if (i + repeat > nlen + ndist) throw new InflateError("invalid", "too many code lengths");
        lengths.fill(value, i, i + repeat);
        i += repeat;
      }
      if (lengths[256] === 0) throw new InflateError("invalid", "the code has no end of block");
      lit = buildHuffman(lengths, 0, nlen);
      dist = buildHuffman(lengths, nlen, ndist);
    } else {
      throw new InflateError("invalid", "invalid block type");
    }
    for (;;) {
      const symbol = decode(lit);
      if (symbol < 256) {
        reserve(1);
        out[length++] = symbol;
      } else if (symbol === 256) {
        break;
      } else {
        const li = symbol - 257;
        if (li >= 29) throw new InflateError("invalid", "invalid length symbol");
        const len = LENGTH_BASE[li]! + bits(LENGTH_EXTRA[li]!);
        const di = decode(dist);
        if (di >= 30) throw new InflateError("invalid", "invalid distance symbol");
        const distance = DIST_BASE[di]! + bits(DIST_EXTRA[di]!);
        if (distance > length) throw new InflateError("invalid", "a distance reaches before the start of the output");
        reserve(len);
        for (let k = 0; k < len; k++, length++) out[length] = out[length - distance]!;
      }
    }
  }
  // The Adler-32 checksum follows, on a byte boundary.
  if (pos + 4 > input.length) throw new InflateError("invalid", "the zlib stream has no checksum");
  const expected = ((input[pos]! << 24) | (input[pos + 1]! << 16) | (input[pos + 2]! << 8) | input[pos + 3]!) >>> 0;
  const result = out.slice(0, length);
  if (adler32(result) !== expected) throw new InflateError("invalid", "the zlib checksum does not match");
  return result;
}
