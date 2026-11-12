// Light and dark: the chart takes its text color from the page (Plot draws in
// currentColor) and its background, which Plot uses for tips and text halos,
// from the nearest opaque ancestor. The scheme decides the fallback colors and
// the controls' look.

export type ThemeOption = "auto" | "light" | "dark";
export type Scheme = "light" | "dark";

export interface Theme {
  scheme: Scheme;
  /** The page background behind the block, or the scheme's default. */
  background: string;
  /** The text color, when forced by the option; otherwise the page's (inherited). */
  color?: string;
}

const DEFAULTS: Record<Scheme, {background: string; color: string}> = {
  light: {background: "#ffffff", color: "#1f2328"},
  dark: {background: "#0d1117", color: "#e6edf3"}
};

/** The theme of the page around an element. */
export function detectTheme(element: Element, option: ThemeOption = "auto"): Theme {
  if (option === "light" || option === "dark") return {scheme: option, ...DEFAULTS[option]};
  const view = element.ownerDocument.defaultView;
  const background = view ? effectiveBackground(element, view) : undefined;
  const scheme = detectScheme(element, background);
  return {scheme, background: background ?? DEFAULTS[scheme].background};
}

/**
 * The color scheme of the page, from the most explicit signal to the least:
 * GitHub's data-color-mode, the CSS color-scheme in effect, the luminance of
 * the background and of the text, then the reader's preference.
 */
export function detectScheme(element: Element, background?: string): Scheme {
  const document = element.ownerDocument;
  const view = document.defaultView;
  if (background === undefined && view) background = effectiveBackground(element, view);
  const prefersDark = () => !!view?.matchMedia?.("(prefers-color-scheme: dark)").matches;

  const mode = element.closest("[data-color-mode]")?.getAttribute("data-color-mode") ?? document.documentElement.getAttribute("data-color-mode");
  if (mode === "light" || mode === "dark") return mode;
  if (mode === "auto") return prefersDark() ? "dark" : "light";

  if (view) {
    const style = view.getComputedStyle(element.parentElement ?? element);
    const words = (style.getPropertyValue("color-scheme") || "").split(/\s+/).filter((w) => w === "light" || w === "dark");
    if (words.length === 1) return words[0] as Scheme;
    const backgroundLuminance = background ? luminance(background) : undefined;
    if (backgroundLuminance !== undefined) return backgroundLuminance < 0.25 ? "dark" : "light";
    const textLuminance = luminance(style.color);
    if (textLuminance !== undefined && words.length === 0) return textLuminance > 0.4 ? "dark" : "light";
    if (words.length === 2) return prefersDark() ? "dark" : "light";
  }
  return prefersDark() ? "dark" : "light";
}

/** The first opaque background color of the element or its ancestors. */
function effectiveBackground(element: Element, view: Window): string | undefined {
  for (let node: Element | null = element.parentElement ?? element; node; node = node.parentElement) {
    const color = view.getComputedStyle(node).backgroundColor;
    if (color && !isTransparent(color)) return color;
  }
  return undefined;
}

function isTransparent(color: string): boolean {
  if (color === "transparent") return true;
  const rgba = parseRgb(color);
  return rgba !== undefined && rgba[3] === 0;
}

function parseRgb(color: string): [number, number, number, number] | undefined {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(color.trim());
  if (!match) return undefined;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  return [+match[1]!, +match[2]!, +match[3]!, alpha];
}

/** The relative luminance (0 to 1) of an rgb() color, or undefined for any other form. */
export function luminance(color: string): number | undefined {
  const rgba = parseRgb(color);
  if (!rgba) return undefined;
  const [r, g, b] = rgba.slice(0, 3).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
