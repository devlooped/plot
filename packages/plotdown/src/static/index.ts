// plotdown/static: a plot block in, one standalone SVG out, for Markdown
// surfaces that only show images (GitHub, GitLab, npm…) and for image services.
//
// Everything is inside the one <svg>: Plot draws titles, subtitles, captions and
// swatch legends as HTML, so they are drawn again here as SVG text, with
// estimated widths. The output is deterministic (the same block gives the same
// bytes, in jsdom or linkedom alike), carries its own light and dark colors, and
// never loads anything: no remote data, no remote image, no web font.
//
// This module imports nothing Node-only: pass it the document to draw with.
import {PlotdownError} from "../errors.js";
import type {PlotdownLimits} from "../limits.js";
import {parse} from "../parse.js";
import {render} from "../render.js";
import type {MarkSpec, PlotSpec} from "../types.js";
import {withStaticCanvas} from "./canvas.js";
import {textWidth, truncateText, wrapText} from "./text.js";
import {escapeAttribute, escapeText, formatNumber, serializeElement, type SerializeContext} from "./xml.js";

/** Which colors the SVG uses: those of the reader's color scheme (auto), or always light or dark. */
export type StaticTheme = "auto" | "light" | "dark";

export interface StaticOptions {
  /** The document that creates the elements: a jsdom or linkedom document outside a browser. */
  document: Document;
  /** "auto" (the default) follows prefers-color-scheme; "light" and "dark" fix the colors. */
  theme?: StaticTheme;
  limits?: Partial<PlotdownLimits>;
}

/** A rendered chart. */
export interface StaticChart {
  /** The standalone SVG document, without an XML declaration. */
  svg: string;
  width: number;
  height: number;
  /** A text alternative: the title, aria label, subtitle or caption of the chart, or "Chart". */
  alt: string;
}

interface Palette {
  background: string;
  foreground: string;
  muted: string;
}

/** The colors of GitHub's default light and dark themes, which the image sits on. */
export const STATIC_PALETTES: Readonly<Record<"light" | "dark", Readonly<Palette>>> = {
  light: {background: "#ffffff", foreground: "#1f2328", muted: "#59636e"},
  dark: {background: "#0d1117", foreground: "#f0f6fc", muted: "#9198a1"}
};

const ROOT_CLASS = "plotdown-static";
const PADDING = 8;
const FONT_FAMILY = "system-ui, sans-serif";
const TITLE = {size: 16, lineHeight: 20, weight: "600"};
const SUBTITLE = {size: 12, lineHeight: 16};
const CAPTION = {size: 12, lineHeight: 16};
const LEGEND_FONT_SIZE = 10;

/**
 * Renders a plot block (its text or a parsed object) as a standalone SVG string.
 * Throws a PlotdownError naming the JSON path of a problem.
 */
export function renderSvg(source: string | object, options: StaticOptions): string {
  return renderStatic(source, options).svg;
}

/** Renders a plot block as a standalone SVG, with its size and a text alternative. */
export function renderStatic(source: string | object, options: StaticOptions): StaticChart {
  if (!options || !options.document) {
    throw new PlotdownError("$", "renderSvg needs a document: pass a jsdom or linkedom document as the document option");
  }
  const text = typeof source === "string" ? source : JSON.stringify(source);
  const spec = parse(text, {limits: options.limits});
  seedShuffles(spec);
  const figure = render(spec, {document: withStaticCanvas(options.document), allowRemote: false, limits: options.limits});
  const context: SerializeContext = {idPrefix: `pd${hash(text)}`, ids: new Map()};
  return compose(figure, spec, context, options.theme ?? "auto");
}

/** Without a seed, the shuffle transform is random: a fixed seed keeps the bytes the same. */
function seedShuffles(spec: PlotSpec): void {
  if (!Array.isArray(spec.marks)) return;
  for (const mark of spec.marks as MarkSpec[]) {
    if (!mark || typeof mark !== "object" || !Array.isArray(mark.transform) || "seed" in mark) continue;
    for (const transform of mark.transform) {
      if (!transform || typeof transform !== "object" || !("shuffle" in transform)) continue;
      const arg = transform.shuffle;
      if (arg === true) transform.shuffle = {seed: 0};
      else if (arg && typeof arg === "object" && !Array.isArray(arg) && !("seed" in arg)) transform.shuffle = {...arg, seed: 0};
    }
  }
}

/** FNV-1a, 32 bits, as 8 hex digits. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const n = formatNumber;

function numberAttribute(element: Element, name: string, fallback: number): number {
  const value = Number.parseFloat(element.getAttribute(name) ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function hasClassSuffix(element: Element, suffix: string): boolean {
  return (element.getAttribute("class") ?? "").split(/\s+/).some((c) => c.endsWith(suffix));
}

function stylePixels(element: Element, property: string): number | undefined {
  const style = element.getAttribute("style") ?? "";
  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*(-?[\\d.]+)px`, "i").exec(style);
  return match ? Number(match[1]) : undefined;
}

interface Part {
  height: number;
  width: number;
  /** The markup of the part, drawn with its top-left corner at (x, y). */
  draw(x: number, y: number): string;
}

function textLines(lines: string[], font: {size: number; lineHeight: number; weight?: string}, muted: boolean, maxWidth: number): Part {
  const width = Math.max(0, ...lines.map((line) => textWidth(line, font.size, font.weight !== undefined)));
  return {
    height: lines.length * font.lineHeight,
    width: Math.min(width, maxWidth),
    draw: (x, y) =>
      lines
        .map((line, i) => {
          const baseline = y + i * font.lineHeight + font.lineHeight / 2 + font.size * 0.35;
          const weight = font.weight ? ` font-weight="${font.weight}"` : "";
          const fill = muted ? ` class="pd-muted"` : ` fill="currentColor"`;
          return `<text x="${n(x)}" y="${n(baseline)}" font-size="${font.size}"${weight}${fill}>${escapeText(line)}</text>`;
        })
        .join("")
  };
}

interface Swatch {
  svg: Element;
  label: string;
}

function readSwatches(div: Element): Swatch[] {
  const swatches: Swatch[] = [];
  for (let item = div.firstElementChild; item; item = item.nextElementSibling) {
    if (!hasClassSuffix(item, "-swatch")) continue;
    let svg: Element | undefined;
    let label = "";
    for (let node = item.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 1 && (node as Element).localName === "svg") svg ??= node as Element;
      else label += node.textContent ?? "";
    }
    if (svg) swatches.push({svg, label: label.trim()});
  }
  return swatches;
}

function swatchLegend(div: Element, maxWidth: number, context: SerializeContext): Part {
  const swatches = readSwatches(div);
  const marginLeft = stylePixels(div, "margin-left") ?? 0;
  const available = Math.max(1, (stylePixels(div, "width") ?? maxWidth) - marginLeft);
  const columns = /-swatches-columns\b/.test(div.getAttribute("class") ?? "") ? Math.max(1, Number.parseInt(/columns\s*:\s*(\d+)/.exec(div.getAttribute("style") ?? "")?.[1] ?? "1", 10)) : 0;
  const sizes = swatches.map(({svg}) => ({w: numberAttribute(svg, "width", 15), h: numberAttribute(svg, "height", 15)}));
  const swatchHeight = Math.max(10, ...sizes.map((s) => s.h));
  const gap = LEGEND_FONT_SIZE / 2; // between the swatch and its label
  const placed: {x: number; row: number; label: string}[] = [];
  let rows = 0;
  let rowHeight: number;
  if (columns) {
    rowHeight = Math.max(swatchHeight, 12) + 2;
    rows = Math.ceil(swatches.length / columns);
    const columnWidth = available / columns;
    swatches.forEach((swatch, i) => {
      const column = Math.floor(i / rows);
      const label = truncateText(swatch.label, columnWidth - sizes[i]!.w - gap - 4, LEGEND_FONT_SIZE);
      placed.push({x: marginLeft + column * columnWidth, row: i % rows, label});
    });
  } else {
    rowHeight = Math.max(swatchHeight, 12) + 6;
    let x = 0;
    let row = 0;
    swatches.forEach((swatch, i) => {
      const width = sizes[i]!.w + gap + textWidth(swatch.label, LEGEND_FONT_SIZE);
      if (x > 0 && x + width > available) {
        row++;
        x = 0;
      }
      placed.push({x: marginLeft + x, row, label: swatch.label});
      x += width + LEGEND_FONT_SIZE; // 1em between items
    });
    rows = swatches.length ? row + 1 : 0;
  }
  const blockHeight = columns ? rows * rowHeight : Math.max(33, rows * rowHeight);
  const top = (blockHeight - rows * rowHeight) / 2;
  const width = Math.max(0, ...placed.map((p, i) => p.x + sizes[i]!.w + gap + textWidth(p.label, LEGEND_FONT_SIZE)));
  const fontVariant = /font-variant\s*:\s*([^;]+)/.exec(div.getAttribute("style") ?? "")?.[1]?.trim();
  return {
    height: blockHeight + LEGEND_FONT_SIZE / 2, // margin-bottom: 0.5em
    width,
    draw: (x0, y0) => {
      const items = placed.map((p, i) => {
        const {w, h} = sizes[i]!;
        const center = y0 + top + p.row * rowHeight + rowHeight / 2;
        const x = x0 + p.x;
        const swatch = serializeElement(swatches[i]!.svg, context, {x: n(x), y: n(center - h / 2), overflow: "visible"});
        const label = `<text x="${n(x + w + gap)}" y="${n(center)}" dy="0.32em">${escapeText(p.label)}</text>`;
        return swatch + label;
      });
      const variant = fontVariant && fontVariant !== "normal" ? ` font-variant="${escapeAttribute(fontVariant)}"` : "";
      return `<g fill="currentColor" font-size="${LEGEND_FONT_SIZE}"${variant}>${items.join("")}</g>`;
    }
  };
}

function svgPart(svg: Element, context: SerializeContext, overflow?: string): Part {
  const width = numberAttribute(svg, "width", 640);
  const height = numberAttribute(svg, "height", 400);
  return {
    width,
    height,
    draw: (x, y) => serializeElement(svg, context, {x: n(x), y: n(y), overflow})
  };
}

function altText(spec: PlotSpec): string {
  for (const key of ["title", "ariaLabel", "subtitle", "caption"]) {
    const value = spec[key];
    if (typeof value === "string" && value.trim()) return value.trim().replace(/\s+/g, " ");
  }
  return "Chart";
}

function style(theme: StaticTheme): string {
  const rules = (p: Palette) =>
    `.${ROOT_CLASS}{color:${p.foreground};--plot-background:${p.background}}` +
    `.${ROOT_CLASS} .pd-bg{fill:${p.background}}` +
    `.${ROOT_CLASS} .pd-muted{fill:${p.muted}}`;
  const base = `.${ROOT_CLASS} text,.${ROOT_CLASS} tspan{white-space:pre}`;
  if (theme === "auto") return `${base}${rules(STATIC_PALETTES.light)}@media (prefers-color-scheme:dark){${rules(STATIC_PALETTES.dark)}}`;
  return base + rules(STATIC_PALETTES[theme]);
}

function compose(figure: Element, spec: PlotSpec, context: SerializeContext, theme: StaticTheme): StaticChart {
  let main: Element | undefined;
  const before: Element[] = [];
  const after: Element[] = [];
  if (figure.localName === "svg") {
    main = figure;
  } else {
    for (let child = figure.firstElementChild; child; child = child.nextElementSibling) {
      if (child.localName === "svg" && !hasClassSuffix(child, "-ramp") && !main) main = child;
      else (main ? after : before).push(child);
    }
  }
  if (!main) throw new PlotdownError("$", "Plot drew no chart");
  const chart = svgPart(main, context);
  const contentWidth = chart.width;

  const header: Part[] = [];
  const legends: Part[] = [];
  const footer: Part[] = [];
  // Plot's figure: h2 (title), h3 (subtitle), legends (div of swatches, svg ramps), the chart, figcaption.
  for (const element of [...before, ...after]) {
    const name = element.localName;
    const text = (element.textContent ?? "").trim();
    const below = after.includes(element);
    if (name === "h2" && text) header.push(textLines(wrapText(text, contentWidth, TITLE.size, true), TITLE, false, contentWidth));
    else if (name === "h3" && text) header.push(textLines(wrapText(text, contentWidth, SUBTITLE.size), SUBTITLE, true, contentWidth));
    else if (name === "figcaption" && text) footer.push(textLines(wrapText(text, contentWidth, CAPTION.size), CAPTION, true, contentWidth));
    else if (name === "svg") (below ? footer : legends).push(svgPart(element, context, "visible"));
    else if (name === "div" && hasClassSuffix(element, "-swatches")) (below ? footer : legends).push(swatchLegend(element, contentWidth, context));
  }

  const body: string[] = [];
  let y = PADDING;
  const width = Math.ceil(Math.max(contentWidth, ...header.map((p) => p.width), ...legends.map((p) => p.width), ...footer.map((p) => p.width)) + 2 * PADDING);
  for (const [i, part] of header.entries()) {
    if (i > 0) y += 2;
    body.push(part.draw(PADDING, y));
    y += part.height;
  }
  if (header.length) y += 8;
  for (const part of legends) {
    body.push(part.draw(PADDING, y));
    y += part.height;
  }
  body.push(chart.draw(PADDING, y));
  y += chart.height;
  for (const part of footer) {
    y += 6;
    body.push(part.draw(PADDING, y));
    y += part.height;
  }
  const height = Math.ceil(y + PADDING);
  const alt = altText(spec);
  const palette = STATIC_PALETTES[theme === "dark" ? "dark" : "light"];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" class="${ROOT_CLASS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"` +
    ` role="img" aria-label="${escapeAttribute(alt)}" color="${palette.foreground}" font-family="${FONT_FAMILY}" font-size="10">` +
    `<style>${style(theme)}</style>` +
    `<rect class="pd-bg" width="100%" height="100%" rx="6" fill="${palette.background}"/>` +
    body.join("") +
    `</svg>\n`;
  return {svg, width, height, alt};
}
