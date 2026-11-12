// End-to-end check in a real VS Code: downloads a separate copy (into
// .vscode-test, with its own user data and extensions folders, so the user's
// own VS Code is never touched), starts it with this extension in development
// mode through Playwright, and reads the DOM of the Markdown preview and of a
// notebook. Screenshots go to .vscode-test/screenshots.
//
//   pnpm build && pnpm --filter plotdown test:vscode
//   VSCODE_VERSION=1.90.0 pnpm --filter plotdown test:vscode   (default: stable)
//
// Checks: the preview of sample/sample.md draws two charts, shows the error of
// the invalid block with its JSON path and leaves the gnuplot block as code; the
// charts survive an edit of the document; they follow the light, dark and
// high-contrast themes; remote data stays off until the setting allows it, and
// then the host loads it; a notebook Markdown cell and an
// application/vnd.plotdown+json output render.
import {spawn, spawnSync} from "node:child_process";
import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {downloadAndUnzipVSCode} from "@vscode/test-electron";
import {chromium} from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const testRoot = join(root, ".vscode-test");
const run = join(testRoot, "run");
const shots = join(testRoot, "screenshots");
const workspace = join(run, "workspace");
const userData = join(run, "user-data");
rmSync(run, {recursive: true, force: true});
mkdirSync(shots, {recursive: true});
cpSync(join(root, "sample"), workspace, {recursive: true});

// A local server for the remote-data check.
const server = createServer((request, response) => {
  if (request.url === "/data.csv") {
    response.writeHead(200, {"content-type": "text/csv"});
    response.end("letter,frequency\nA,0.08167\nB,0.01492\nC,0.02782\nD,0.04253\nE,0.12702\n");
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
writeFileSync(
  join(workspace, "remote.md"),
  "# Remote data\n\n```plot\n" +
    JSON.stringify({data: {letters: {url: `${origin}/data.csv`}}, marks: [{mark: "barY", data: "letters", x: "letter", y: "frequency"}]}, null, 2) +
    "\n```\n"
);

const settingsFile = join(userData, "User", "settings.json");
const baseSettings = {
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.enableExperiments": false,
  "window.restoreWindows": "none",
  "update.mode": "none",
  "extensions.autoCheckUpdates": false,
  "extensions.autoUpdate": false,
  "telemetry.telemetryLevel": "off",
  "security.workspace.trust.enabled": false,
  "chat.disableAIFeatures": true,
  "git.enabled": false,
  "files.simpleDialog.enable": true,
  "notebook.confirmDeleteRunningCell": false
};
function settings(extra = {}) {
  mkdirSync(join(userData, "User"), {recursive: true});
  writeFileSync(settingsFile, JSON.stringify({...baseSettings, ...extra}, null, 2));
}
settings({"workbench.colorTheme": "Default Light Modern"});

const results = [];
const check = (name, ok, detail = "") => {
  results.push({name, ok});
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};

/** Whether this VS Code keeps shared data outside its profile (~/.vscode-shared, from 1.14x). */
function hasSharedData(executable) {
  const search = (folder, depth) => {
    for (const entry of readdirSync(folder, {withFileTypes: true})) {
      const path = join(folder, entry.name);
      if (entry.isFile() && entry.name === "product.json") return readFileSync(path, "utf8").includes("sharedDataFolderName");
      if (entry.isDirectory() && depth > 0 && !/node_modules|extensions/.test(entry.name)) {
        const found = search(path, depth - 1);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return search(dirname(executable), 4) ?? true;
}

const executablePath = await downloadAndUnzipVSCode({version: process.env.VSCODE_VERSION ?? "stable", cachePath: testRoot});

// VS Code is started directly, not with Playwright's electron.launch (whose
// arguments VS Code 1.146 did not honor, so it opened the default profile), and
// driven over the Chrome DevTools Protocol. Every folder VS Code writes to is
// under .vscode-test/run: user data, extensions, and the shared data that
// VS Code otherwise keeps in ~/.vscode-shared.
const port = await new Promise((resolve) => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const {port} = probe.address();
    probe.close(() => resolve(port));
  });
});
const env = {...process.env};
for (const name of Object.keys(env)) if (/^(ELECTRON_|VSCODE_)/i.test(name)) delete env[name];
const child = spawn(
  executablePath,
  [
    workspace,
    `--extensionDevelopmentPath=${root}`,
    `--user-data-dir=${userData}`,
    `--extensions-dir=${join(run, "extensions")}`,
    `--shared-data-dir=${join(run, "shared-data")}`,
    `--remote-debugging-port=${port}`,
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-telemetry",
    "--disable-updates",
    "--new-window"
  ],
  {env, stdio: "ignore"}
);
const exited = new Promise((resolve) => child.once("exit", resolve));
const stopVSCode = async () => {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {stdio: "ignore"});
  else child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
};

let browser;
const end = Date.now() + 60_000;
while (!browser && Date.now() < end) {
  if (child.exitCode !== null) break;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
// The guard: this VS Code must be the copy under .vscode-test, with its own profile.
for (let i = 0; browser && i < 40 && !existsSync(join(userData, "Local Storage")); i++) await new Promise((resolve) => setTimeout(resolve, 250));
if (!browser || !existsSync(join(userData, "Local Storage")) || (hasSharedData(executablePath) && !existsSync(join(run, "shared-data")))) {
  console.error("VS Code did not start with its own profile under .vscode-test/run; stopping.");
  await browser?.close().catch(() => {});
  await stopVSCode();
  server.close();
  process.exit(2);
}
const app = {
  async firstWindow() {
    for (;;) {
      const page = browser.contexts().flatMap((context) => context.pages()).find((page) => page.url().includes("workbench"));
      if (page) return page;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  },
  async close() {
    await browser.close().catch(() => {});
    await stopVSCode();
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls fn until it returns a truthy value, or returns the last value after timeout. */
async function until(fn, timeout = 30_000, step = 250) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    try {
      value = await fn();
      if (value) return value;
    } catch {
      // a frame went away: try again
    }
    await sleep(step);
  }
  return value;
}

// Reads every plotdown element under a frame's document, through shadow roots
// (notebook cells live in shadow roots).
const SNAPSHOT = () => {
  const out = {charts: [], errors: [], blocks: [], markdown: !!document.querySelector(".markdown-body"), bodyClass: document.body?.className ?? "", typed: !!document.body?.textContent?.includes("typed while the preview is open")};
  const walk = (node) => {
    for (const element of node.querySelectorAll("*")) {
      if (element.localName === "plotdown-chart") {
        out.charts.push({svg: element.shadowRoot?.querySelectorAll("svg").length ?? 0, scheme: element.getAttribute("data-scheme"), marks: element.shadowRoot?.querySelectorAll("[aria-label]").length ?? 0});
      } else if (element.localName === "plotdown-error") {
        out.errors.push(element.shadowRoot?.textContent ?? "");
      } else if (element.matches("pre.plotdown, pre.plotdown-pending, pre.plotdown-failed")) {
        out.blocks.push({className: element.className, state: element.getAttribute("data-plotdown"), hidden: getComputedStyle(element).display === "none", next: element.nextElementSibling?.textContent?.slice(0, 200) ?? ""});
      }
      if (element.shadowRoot) walk(element.shadowRoot);
    }
  };
  walk(document);
  out.codeBlocks = Array.from(document.querySelectorAll("pre code")).map((code) => code.className);
  return out;
};

async function snapshots(page) {
  const all = [];
  for (const frame of page.frames()) {
    try {
      all.push({url: frame.url(), ...(await frame.evaluate(SNAPSHOT))});
    } catch {
      // detached or not scriptable
    }
  }
  return all;
}

const previewOf = async (page, predicate) => (await snapshots(page)).find((s) => s.markdown && predicate(s));

/** Opens the quick input with a key, types text, and picks the entry that shows label. */
async function pick(page, key, text, label) {
  await page.keyboard.press("Escape");
  await page.keyboard.press(key);
  const input = page.locator(".quick-input-widget input:visible").first();
  await input.waitFor({state: "visible"});
  await input.fill(text);
  const row = page.locator(".quick-input-list .monaco-list-row", {hasText: label}).first();
  await row.waitFor({state: "visible", timeout: 20_000});
  await sleep(200);
  await row.click();
  await sleep(500);
}

const command = (page, title) => pick(page, "F1", ">" + title, title);
const open = (page, file) => pick(page, "Control+P", file, file);

try {
  const page = await app.firstWindow();
  await page.waitForSelector(".monaco-workbench", {timeout: 60_000});
  await sleep(2000);
  console.log(`VS Code: ${executablePath}`);

  // 1. The preview of sample.md.
  await open(page, "sample.md");
  await command(page, "Markdown: Open Preview to the Side");
  let preview = await until(() => previewOf(page, (s) => s.charts.length >= 2 && s.errors.length >= 1));
  await page.screenshot({path: join(shots, "preview-light.png")});
  await page.locator(".part.editor").screenshot({path: join(shots, "editor-light.png")}); // media/preview.png of the readme
  check("preview draws two charts", preview?.charts.length === 2 && preview.charts.every((c) => c.svg > 0), JSON.stringify(preview?.charts));
  check("preview shows the error with its JSON path", preview?.errors.length === 1 && /\$\.marks\[0\]\.colour/.test(preview.errors[0]) && /unknown option "colour"/.test(preview.errors[0]), preview?.errors[0]);
  check("the failing block keeps its source visible", preview?.blocks.some((b) => b.state === "error" && !b.hidden));
  check("the gnuplot block stays code", preview?.blocks.length === 3 && preview.codeBlocks.length === 4, JSON.stringify(preview?.codeBlocks));
  check("light theme", preview?.charts.every((c) => c.scheme === "light"), preview?.bodyClass);

  // 2. Typing in the editor: the preview updates in place, the charts stay.
  await page.keyboard.press("Control+1");
  await sleep(300);
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nA paragraph typed while the preview is open.\n");
  preview = await until(() => previewOf(page, (s) => s.typed), 10_000);
  await sleep(1000);
  preview = await previewOf(page, (s) => s.typed);
  check("charts stay after an edit", preview?.charts.length === 2 && preview.errors.length === 1, JSON.stringify({updated: !!preview, charts: preview?.charts.length, errors: preview?.errors.length}));

  // Edit a block: the chart is redrawn, the old one is gone.
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+1");
  await page.keyboard.press("Control+G");
  await page.locator(".quick-input-widget input:visible").first().fill(":12:1");
  await sleep(300);
  await page.keyboard.press("Enter");
  await sleep(300);
  // At the start of the line of "]": a new mark, written so that auto-closed brackets and quotes are typed over.
  await page.keyboard.type('    ,{"mark": "ruleY", "data": [4000], "stroke": "red"}\n');
  preview = await until(() => previewOf(page, (s) => s.charts.length === 2), 5000);
  await sleep(1500);
  preview = await previewOf(page, () => true);
  check("an edited block is drawn again, once", preview?.charts.length === 2 && preview.blocks.filter((b) => b.state === "rendered").length === 2, JSON.stringify(preview?.blocks));
  await page.screenshot({path: join(shots, "preview-edited.png")});
  await page.keyboard.press("Control+1");
  await command(page, "File: Revert File");
  await sleep(500);

  // 3. Themes.
  for (const [theme, kind, scheme, shot] of [
    ["Default Dark Modern", "vscode-dark", "dark", "preview-dark.png"],
    ["Default High Contrast", "vscode-high-contrast", "dark", "preview-hc-dark.png"],
    ["Default High Contrast Light", "vscode-high-contrast-light", "light", "preview-hc-light.png"]
  ]) {
    settings({"workbench.colorTheme": theme});
    preview = await until(
      () => previewOf(page, (s) => s.bodyClass.split(" ").includes(kind) && s.charts.length === 2 && s.charts.every((c) => c.scheme === scheme)),
      15_000
    );
    await sleep(500);
    await page.screenshot({path: join(shots, shot)});
    check(`theme ${theme}: charts are ${scheme}`, !!preview, preview?.bodyClass);
  }
  settings({"workbench.colorTheme": "Default Dark Modern"});

  // 4. Remote data: off by default, then loaded by the host when the setting allows it.
  await page.keyboard.press("Control+K");
  await page.keyboard.press("Control+W"); // close all editors
  await sleep(800);
  await open(page, "remote.md");
  await command(page, "Markdown: Open Preview to the Side");
  preview = await until(() => previewOf(page, (s) => s.errors.length === 1));
  check("remote data is off by default", /allowRemote is false/.test(preview?.errors[0] ?? ""), preview?.errors[0]);
  settings({"workbench.colorTheme": "Default Dark Modern", "plotdown.allowRemoteData": [origin]});
  preview = await until(() => previewOf(page, (s) => s.charts.length === 1 && s.charts[0].svg > 0), 15_000);
  await page.screenshot({path: join(shots, "preview-remote.png")});
  check("remote data loads when the setting lists its origin", !!preview, JSON.stringify(preview?.blocks));
  settings({"workbench.colorTheme": "Default Dark Modern", "plotdown.allowRemoteData": ["https://elsewhere.example"]});
  preview = await until(() => previewOf(page, (s) => s.charts.length === 0 && s.blocks.some((b) => /not from an allowed origin/.test(b.next))), 15_000);
  check("an origin not in the list is refused, with the path", !!preview, JSON.stringify(preview?.blocks));

  // 5. A notebook: a Markdown cell and an output of the plotdown MIME type.
  await page.keyboard.press("Control+K");
  await page.keyboard.press("Control+W");
  await sleep(800);
  await open(page, "sample.ipynb");
  const notebook = await until(async () => {
    const all = await snapshots(page);
    const charts = all.flatMap((s) => s.charts);
    return charts.length >= 2 ? {charts, frames: all.filter((s) => s.charts.length).map((s) => s.url.slice(0, 80))} : undefined;
  }, 45_000);
  await sleep(1000);
  await page.screenshot({path: join(shots, "notebook.png")});
  check("notebook: Markdown cell and plotdown output draw charts", notebook?.charts.length === 2 && notebook.charts.every((c) => c.svg > 0), JSON.stringify(notebook));
} catch (error) {
  console.error(error);
  results.push({name: "run", ok: false});
  try {
    const page = await app.firstWindow();
    await page.screenshot({path: join(shots, "failure.png")});
  } catch {}
} finally {
  await app.close().catch(() => {});
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${shots}`);
process.exit(failed.length ? 1 : 0);