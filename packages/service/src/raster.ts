// SVG to PNG with resvg (Rust, through a Node-API binary: it runs in a Vercel
// Node function, which builds on Linux x64 with glibc). Only the fonts of the
// package are loaded, never the system's, so that a PNG looks the same on every
// machine: Liberation Sans has the advance widths of Arial and Helvetica, which
// are the widths the static SVG estimates its titles and legends with.
import {fileURLToPath} from "node:url";
import {Resvg} from "@resvg/resvg-js";

const FONT_FAMILY = "Liberation Sans";

/** The fonts directory: ../fonts from src/ and from dist/ alike. */
const fontsDir = fileURLToPath(new URL("../fonts/", import.meta.url));
export const FONT_FILES: readonly string[] = ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf"].map((f) => fontsDir + f);

/** Draws an SVG as a PNG at a scale (device pixels per CSS pixel). */
export function rasterize(svg: string, scale: number): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: {mode: "zoom", value: scale},
    font: {
      loadSystemFonts: false,
      fontFiles: [...FONT_FILES],
      defaultFontFamily: FONT_FAMILY,
      sansSerifFamily: FONT_FAMILY,
      serifFamily: FONT_FAMILY,
      monospaceFamily: FONT_FAMILY,
      defaultFontSize: 10
    },
    logLevel: "off"
  });
  // A copy that owns its memory, so that a worker can transfer it.
  return new Uint8Array(resvg.render().asPng());
}
