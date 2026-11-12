// The background (a service worker in Chrome and Edge, an event page in
// Firefox): injects plotdown.js into a frame whose detector found a block, if
// the site is switched on. It makes no network request.
import {FOUND, GRANTED_SCRIPT_ID, INJECTIONS, PLOTDOWN_CONFIG, PLOTDOWN_FILE, type InjectResult, type Injection} from "./messages.js";
import {isOn, loadSettings, siteOf} from "./settings.js";

const MAX_INJECTIONS = 50;

chrome.runtime.onMessage.addListener((message: {type?: unknown} | undefined, sender, sendResponse) => {
  if (message?.type !== FOUND) return false;
  inject(sender).then(sendResponse, (error: unknown) => sendResponse({injected: false, reason: String(error)} satisfies InjectResult));
  return true;
});

async function inject(sender: chrome.runtime.MessageSender): Promise<InjectResult> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || tabId < 0) return {injected: false, reason: "not in a tab"};
  // The switch of the page shown in the tab, also for its frames.
  const site = siteOf(sender.tab?.url ?? sender.url);
  if (!isOn(await loadSettings(chrome.storage.local), site)) return {injected: false, reason: "off"};
  const frameId = sender.frameId ?? 0;
  const target = {tabId, frameIds: [frameId]};
  // Options first, then the script, in the content scripts' isolated world.
  await chrome.scripting.executeScript({target, func: configure, args: [PLOTDOWN_CONFIG]});
  await chrome.scripting.executeScript({target, files: [PLOTDOWN_FILE]});
  await remember({tabId, frameId, url: sender.url ?? sender.tab?.url ?? "", time: Date.now()});
  return {injected: true};
}

/** Runs in the page's isolated world, before plotdown.js: its options win over any a page's script tag holds. */
function configure(config: Record<string, unknown>): void {
  (globalThis as {plotdownConfig?: unknown}).plotdownConfig = {...config};
}

/** Keeps the last injections in storage.session (memory only), for the popup and the tests. */
async function remember(injection: Injection): Promise<void> {
  try {
    const list = ((await chrome.storage.session.get(INJECTIONS))[INJECTIONS] as Injection[] | undefined) ?? [];
    list.push(injection);
    await chrome.storage.session.set({[INJECTIONS]: list.slice(-MAX_INJECTIONS)});
  } catch {
    // storage.session is missing in old browsers: the record is only informative.
  }
}

// The known-hosts build lists a few hosts in its manifest and asks for the
// others one site at a time (optional host permissions): each site granted
// gets the detector through a registered content script. The all-sites build
// covers every site in its manifest and registers nothing.
const ALL_SITES = ["<all_urls>", "*://*/*", "http://*/*", "https://*/*"];

async function syncGrantedScripts(): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const listed = (manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []);
  if (listed.some((match) => ALL_SITES.includes(match))) return;
  const {origins = []} = await chrome.permissions.getAll();
  const granted = origins.filter((origin) => !listed.includes(origin));
  const registered = await chrome.scripting.getRegisteredContentScripts({ids: [GRANTED_SCRIPT_ID]});
  if (registered.length) await chrome.scripting.unregisterContentScripts({ids: [GRANTED_SCRIPT_ID]});
  if (!granted.length) return;
  await chrome.scripting.registerContentScripts([
    {id: GRANTED_SCRIPT_ID, matches: granted, js: ["content.js"], runAt: "document_idle", allFrames: true}
  ]);
}

const sync = () => void syncGrantedScripts().catch((error: unknown) => console.warn("plotdown: cannot register the content script of granted sites", error));
chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.permissions.onAdded.addListener(sync);
chrome.permissions.onRemoved.addListener(sync);
