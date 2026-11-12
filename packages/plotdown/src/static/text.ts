// Estimated text widths. A static SVG cannot measure its text: the reader's
// font decides. These are the advance widths of Helvetica (in thousandths of
// an em) for printable ASCII, close to Arial, Segoe UI and San Francisco, the
// fonts system-ui resolves to; others get an average, wide scripts a full em.

const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space to /
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 0 to ?
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // @ to O
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // P to _
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // ` to o
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584 // p to ~
];

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

function isZeroWidth(code: number): boolean {
  return (code >= 0x0300 && code <= 0x036f) || (code >= 0x200b && code <= 0x200f) || code === 0xfe0f || (code >= 0xfe00 && code <= 0xfe0e);
}

/** The estimated width of a text in pixels, at a font size, bold or not. */
export function textWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code >= 32 && code <= 126) units += ASCII_WIDTHS[code - 32]!;
    else if (isZeroWidth(code)) continue;
    else if (isWide(code)) units += 1000;
    else units += 580;
  }
  return (units / 1000) * fontSize * (bold ? 1.08 : 1);
}

/** Splits a text into lines that fit a width, at spaces; a word longer than the width gets a line of its own. */
export function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && textWidth(candidate, fontSize, bold) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Shortens a text with an ellipsis so that it fits a width. */
export function truncateText(text: string, maxWidth: number, fontSize: number): string {
  if (textWidth(text, fontSize) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && textWidth(`${chars.join("")}…`, fontSize) > maxWidth) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}
