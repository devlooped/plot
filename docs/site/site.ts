// Every page: the theme switch, copy buttons on code blocks, links on headings.
export {};

const KEY = "plotdown-theme";
const root = document.documentElement;
const media = matchMedia("(prefers-color-scheme: dark)");

type Theme = "light" | "dark";

function current(): Theme {
  return root.dataset.theme === "dark" ? "dark" : "light";
}

function remember(theme: Theme | null): void {
  try {
    if (theme) localStorage.setItem(KEY, theme);
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the choice lasts for this page only
  }
}

function chosen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

function apply(theme: Theme): void {
  root.dataset.theme = theme;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-switch]")) {
    const label = theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme";
    button.setAttribute("aria-label", label);
    button.title = label;
  }
}

apply(current());

document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  if (target?.closest("[data-theme-switch]")) {
    const next: Theme = current() === "dark" ? "light" : "dark";
    // Back to the system's theme when the choice matches it.
    remember(next === (media.matches ? "dark" : "light") ? null : next);
    apply(next);
  }
});

media.addEventListener("change", () => {
  if (!chosen()) apply(media.matches ? "dark" : "light");
});

// Copy buttons on code blocks (not on plot blocks, which plotdown.js draws).
for (const pre of document.querySelectorAll<HTMLPreElement>("pre.shiki")) {
  if (pre.closest(".fold-source, [data-no-copy]")) continue;
  const wrap = document.createElement("div");
  wrap.className = "code";
  pre.replaceWith(wrap);
  wrap.append(pre);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy";
  button.textContent = "Copy";
  button.addEventListener("click", async () => {
    const text = (pre.querySelector("code") ?? pre).textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select and copy";
    }
    setTimeout(() => (button.textContent = "Copy"), 1600);
  });
  wrap.append(button);
}

// A link on each heading that has an id, in documents.
for (const heading of document.querySelectorAll<HTMLElement>(".prose :is(h2, h3)[id]")) {
  const link = document.createElement("a");
  link.className = "anchor";
  link.href = `#${heading.id}`;
  link.setAttribute("aria-label", `Link to ${heading.textContent ?? "this section"}`);
  link.textContent = "#";
  heading.append(link);
}
