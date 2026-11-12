// Every chart and error lives in a shadow root, so the page's CSS does not reach
// it and its CSS does not reach the page. Styles go in as constructed style
// sheets: a page whose Content-Security-Policy forbids inline <style> elements
// (style-src without 'unsafe-inline') still applies them, since CSP does not
// govern the CSSOM. Plot's own <style> elements are moved into such sheets
// before the chart is attached, so the page never sees them.

export const HOST_CSS = `
:host { display: block; margin: 0 0 16px; color: var(--plotdown-color, inherit); }
:host([data-forced]) { background: var(--plotdown-background); padding: 8px; border-radius: 6px; }
[hidden] { display: none !important; }
.toolbar { display: flex; justify-content: flex-end; align-items: stretch; gap: 6px; min-height: 0; }
button {
  font: 12px/1.5 system-ui, sans-serif; color: inherit; background: transparent; cursor: pointer;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 6px; padding: 1px 8px; opacity: 0.6;
}
button:hover, button:focus-visible, button[aria-expanded="true"] { opacity: 1; }
button.icon { display: inline-flex; align-items: center; padding: 1px 6px; }
button.icon svg { display: block; }
button[data-state="done"] { color: #1a7f37; opacity: 1; }
:host([data-scheme="dark"]) button[data-state="done"] { color: #3fb950; }
button[data-state="failed"] { color: #d1242f; opacity: 1; }
.copy { position: relative; display: flex; }
.menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 10; display: flex; flex-direction: column; min-width: 80px; padding: 4px;
  background: var(--plotdown-background, Canvas); border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 6px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
}
.menu button { border: 0; border-radius: 4px; text-align: left; padding: 2px 10px; opacity: 0.85; }
.menu button:hover, .menu button:focus-visible { opacity: 1; background: color-mix(in srgb, currentColor 12%, transparent); outline: none; }
.chart { overflow-x: auto; }
.chart svg { --plot-background: var(--plotdown-background); }
figure { margin: 0; }
figure h2 { font-size: 1.15em; font-weight: 600; margin: 0 0 0.25em; line-height: 1.3; }
figure h3 { font-size: 1em; font-weight: 400; margin: 0 0 0.5em; opacity: 0.75; line-height: 1.3; }
figure figcaption { font-size: 0.9em; opacity: 0.75; margin-top: 0.25em; }
.error {
  font: 12px/1.5 system-ui, sans-serif; white-space: pre-wrap; margin: 4px 0 0; padding: 4px 8px;
  border-left: 3px solid #d1242f; background: color-mix(in srgb, #d1242f 10%, transparent);
}
.error code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
`;

const sheets = new WeakMap<Document, Map<string, CSSStyleSheet>>();

/**
 * Adds style sheets to a shadow root: constructed sheets where the browser has
 * them, <style> elements otherwise (old browsers, and content scripts of
 * browsers that refuse a sheet built in another world).
 */
export function adoptStyles(root: ShadowRoot, cssTexts: readonly string[]): void {
  const document = root.ownerDocument;
  const Sheet = document.defaultView?.CSSStyleSheet;
  try {
    if (Sheet && "adoptedStyleSheets" in root && typeof Sheet.prototype.replaceSync === "function") {
      let cache = sheets.get(document);
      if (!cache) sheets.set(document, (cache = new Map()));
      const adopted = cssTexts.map((text) => {
        let sheet = cache.get(text);
        if (!sheet) {
          sheet = new Sheet();
          sheet.replaceSync(text);
          cache.set(text, sheet);
        }
        return sheet;
      });
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...adopted];
      if (root.adoptedStyleSheets.length >= adopted.length) return;
    }
  } catch {
    // fall through to <style> elements
  }
  for (const text of cssTexts) {
    const style = document.createElement("style");
    style.textContent = text;
    root.append(style);
  }
}

/** Removes the <style> elements Plot put in a chart and returns their text. */
export function takeStyles(figure: Element): string[] {
  const texts: string[] = [];
  for (const style of Array.from(figure.querySelectorAll("style"))) {
    texts.push(style.textContent ?? "");
    style.remove();
  }
  return texts;
}
