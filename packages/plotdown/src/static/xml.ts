// Serializes the SVG that Plot drew as XML, in a canonical form that does not
// depend on the DOM implementation: attributes sorted by name, style
// declarations normalized, coordinates rounded, Plot's generated ids renamed
// in order of appearance, and Plot's <style> elements and hidden tips left out.

const GEOMETRY = new Set(["cx", "cy", "d", "dx", "dy", "height", "points", "r", "rx", "ry", "transform", "viewBox", "width", "x", "x1", "x2", "y", "y1", "y2"]);
const NUMBER = /-?(?:\d+\.\d*|\.\d+)(?:[eE][-+]?\d+)?|-?\d+[eE][-+]?\d+/g;
const PLOT_ID = /\bplot-[a-z]+-\d+\b/g;

export function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

export function escapeAttribute(text: string): string {
  return text.replace(/[&<>"\n\r\t]/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "\n":
        return "&#10;";
      case "\r":
        return "&#13;";
      default:
        return "&#9;";
    }
  });
}

/** A number with at most three decimals, without trailing zeros or a negative zero. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function roundNumbers(value: string): string {
  return value.replace(NUMBER, (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? formatNumber(v) : n;
  });
}

/** `a: b; c: d` as `a:b;c:d`, whatever the DOM implementation wrote. */
export function normalizeStyle(style: string): string {
  return style
    .split(";")
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      if (colon < 0) return "";
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim().replace(/\s+/g, " ");
      return property && value ? `${property}:${value}` : "";
    })
    .filter(Boolean)
    .join(";");
}

export interface SerializeContext {
  /** Prefix of the ids written in place of Plot's, unique to the chart. */
  idPrefix: string;
  ids: Map<string, string>;
}

function renameIds(value: string, context: SerializeContext): string {
  return value.replace(PLOT_ID, (id) => {
    let renamed = context.ids.get(id);
    if (renamed === undefined) {
      const kind = id.split("-")[1];
      renamed = `${context.idPrefix}-${kind}-${context.ids.size + 1}`;
      context.ids.set(id, renamed);
    }
    return renamed;
  });
}

/** The attributes of an element, canonical, as ` name="value"…`. Extra attributes override. */
export function serializeAttributes(element: Element, context: SerializeContext, extra: Record<string, string | undefined> = {}): string {
  const attributes = new Map<string, string>();
  for (const attribute of Array.from(element.attributes)) {
    let name = attribute.name;
    if (name === "xmlns" || name.startsWith("xmlns:")) continue;
    if (name === "xlink:href") name = "href";
    let value = attribute.value;
    if (name === "style") value = normalizeStyle(value);
    else if (GEOMETRY.has(name)) value = roundNumbers(value);
    value = renameIds(value, context);
    attributes.set(name, value);
  }
  for (const [name, value] of Object.entries(extra)) {
    if (value === undefined) attributes.delete(name);
    else attributes.set(name, value);
  }
  return Array.from(attributes)
    .filter(([name, value]) => !(name === "style" && value === ""))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
}

function isHiddenTip(element: Element): boolean {
  // Plot lays tips out once the chart is in a page (with getBBox), which never
  // happens here: they stay hidden, so they are left out.
  return element.getAttribute("aria-label") === "tip" || element.getAttribute("visibility") === "hidden";
}

/** Serializes the children of an element. */
export function serializeChildren(element: Element, context: SerializeContext): string {
  let out = "";
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 3) out += escapeText(node.nodeValue ?? "");
    else if (node.nodeType === 1) out += serializeElement(node as Element, context);
  }
  return out;
}

/** Serializes an SVG element and its subtree. Extra attributes override the element's own. */
export function serializeElement(element: Element, context: SerializeContext, extra?: Record<string, string | undefined>): string {
  const name = element.localName;
  if (name.toLowerCase() === "style" || isHiddenTip(element)) return "";
  const attributes = serializeAttributes(element, context, extra);
  const children = serializeChildren(element, context);
  return children ? `<${name}${attributes}>${children}</${name}>` : `<${name}${attributes}/>`;
}
