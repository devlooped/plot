// A minimal WebDriver BiDi client for Firefox: enough to install the extension
// as a temporary add-on, open pages and run scripts in them. Playwright cannot
// load an extension into Firefox; BiDi's webExtension.install can. Node's own
// WebSocket, no dependency.
import {spawn} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Where Firefox may be: PLOTDOWN_FIREFOX, the usual install folders, then Playwright's own build. */
export function findFirefox() {
  const candidates = [
    process.env.PLOTDOWN_FIREFOX,
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Mozilla Firefox", "firefox.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Mozilla Firefox", "firefox.exe"),
    "/Applications/Firefox.app/Contents/MacOS/firefox",
    "/usr/bin/firefox",
    "/snap/bin/firefox"
  ];
  const playwright = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".cache"), "ms-playwright");
  if (fs.existsSync(playwright)) {
    for (const dir of fs.readdirSync(playwright).filter((name) => name.startsWith("firefox-")).sort().reverse()) {
      candidates.push(path.join(playwright, dir, "firefox", "firefox.exe"), path.join(playwright, dir, "firefox", "firefox"));
    }
  }
  return candidates.find((file) => file && fs.existsSync(file));
}

/**
 * Starts Firefox with a new profile and a BiDi session.
 * @param {{binary: string, headless?: boolean, prefs?: Record<string, unknown>}} options
 */
export async function launchFirefox({binary, headless = true, prefs = {}}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "plotdown-firefox-"));
  const allPrefs = {
    "browser.shell.checkDefaultBrowser": false,
    "browser.startup.homepage_override.mstone": "ignore",
    "browser.aboutwelcome.enabled": false,
    "datareporting.policy.dataSubmissionEnabled": false,
    "toolkit.telemetry.reportingpolicy.firstRun": false,
    "app.update.enabled": false,
    "remote.prefs.recommended": true,
    ...prefs
  };
  fs.writeFileSync(path.join(profile, "user.js"), Object.entries(allPrefs).map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join("\n") + "\n");
  const args = ["--remote-debugging-port=0", "--profile", profile, "--no-remote", "--new-instance", ...(headless ? ["--headless"] : []), "about:blank"];
  const child = spawn(binary, args, {stdio: ["ignore", "pipe", "pipe"]});
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Firefox did not start BiDi:\n${output}`)), 30000);
    const onData = (chunk) => {
      output += chunk;
      const match = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`Firefox exited (${code}):\n${output}`)));
  });
  const socket = new WebSocket(`${endpoint.replace(/\/$/, "")}/session`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, {once: true});
    socket.addEventListener("error", reject, {once: true});
  });
  let next = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (process.env.PLOTDOWN_DEBUG) console.log("bidi <", String(event.data).slice(0, 300));
    if (message.id === undefined || !pending.has(message.id)) return;
    const {resolve, reject} = pending.get(message.id);
    pending.delete(message.id);
    if (message.type === "error") reject(new Error(`${message.error}: ${message.message}`));
    else resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, {resolve, reject});
      if (process.env.PLOTDOWN_DEBUG) console.log("bidi >", method, JSON.stringify(params).slice(0, 200));
      socket.send(JSON.stringify({id, method, params}));
    });
  const session = await send("session.new", {capabilities: {}});
  const close = async () => {
    await send("browser.close").catch(() => {});
    socket.close();
    await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once("exit", resolve)));
    fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
  };
  return {send, close, version: session.capabilities.browserVersion, name: session.capabilities.browserName};
}

/** Runs an expression in a page and returns its value, which the expression must give as JSON text. */
export async function evaluate(send, context, expression) {
  const result = await send("script.evaluate", {expression, target: {context}, awaitPromise: true, resultOwnership: "none"});
  if (result.type === "exception") throw new Error(`in the page: ${result.exceptionDetails.text}`);
  return result.result.type === "string" ? JSON.parse(result.result.value) : undefined;
}
