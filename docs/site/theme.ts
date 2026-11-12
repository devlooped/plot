// Runs in <head>, before the page paints: sets the theme the reader chose last
// time, or the one of the system, as data-theme on <html>. plotdown.js reads
// the page's color-scheme, which the style sheet derives from it.
export {};

const KEY = "plotdown-theme";

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const choice = stored();
const system = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
document.documentElement.dataset.theme = choice === "light" || choice === "dark" ? choice : system;
