// The popup: the switch of the current site, the global switch, and, where the
// extension has no access to the site, a button that asks for it. A change
// reloads the tab, so the page shows the charts, or the code again, at once.
import {isOn, loadSettings, saveSettings, siteOf, withSite} from "./settings.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const siteBox = $<HTMLInputElement>("site");
const globalBox = $<HTMLInputElement>("global");
const allow = $<HTMLButtonElement>("allow");
const status = $<HTMLParagraphElement>("status");

/** The tab the popup acts on: the active one, or ?tab=<id> (used by the tests, which open the popup as a page). */
async function currentTab(): Promise<chrome.tabs.Tab | undefined> {
  const id = Number(new URLSearchParams(location.search).get("tab"));
  if (id) return chrome.tabs.get(id);
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  return tab;
}

async function chartCount(tabId: number): Promise<number | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: {tabId, allFrames: true},
      func: () => document.querySelectorAll("plotdown-chart").length
    });
    return results.reduce((sum, result) => sum + (typeof result.result === "number" ? result.result : 0), 0);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  $("version").textContent = chrome.runtime.getManifest().version;
  const tab = await currentTab();
  const site = siteOf(tab?.url);
  const area = chrome.storage.local;
  let settings = await loadSettings(area);
  // Asked for both schemes; checked for the page's own ("*://" would also mean ws and wss in Chrome).
  const origins = site ? [`https://${site}/*`, `http://${site}/*`] : null;
  const pageOrigin = site && tab?.url ? `${new URL(tab.url).protocol}//${site}/*` : null;
  const access = pageOrigin ? await chrome.permissions.contains({origins: [pageOrigin]}).catch(() => false) : false;

  const reload = () => {
    if (tab?.id !== undefined) void chrome.tabs.reload(tab.id);
  };
  const render = async () => {
    globalBox.checked = settings.enabled;
    siteBox.checked = site !== null && !settings.off.includes(site);
    siteBox.disabled = site === null || !settings.enabled;
    $("host").textContent = site ?? "this page";
    allow.hidden = site === null || access;
    if (site) allow.textContent = `Allow on ${site}`;
    if (site === null) status.textContent = "plotdown does not run on this page.";
    else if (!access) status.textContent = "plotdown has no access to this site yet.";
    else if (!isOn(settings, site)) status.textContent = "Off here: plot blocks stay code.";
    else {
      const count = tab?.id !== undefined ? await chartCount(tab.id) : null;
      status.textContent = count ? `${count} chart${count === 1 ? "" : "s"} on this page.` : count === 0 ? "No chart on this page." : "";
    }
  };

  siteBox.addEventListener("change", async () => {
    if (!site) return;
    settings = withSite(settings, site, siteBox.checked);
    await saveSettings(area, settings);
    await render();
    reload();
  });
  globalBox.addEventListener("change", async () => {
    settings = {...settings, enabled: globalBox.checked};
    await saveSettings(area, settings);
    await render();
    reload();
  });
  allow.addEventListener("click", async () => {
    if (!origins) return;
    // The background registers the detector for the site when the permission is added.
    if (await chrome.permissions.request({origins})) reload();
    window.close();
  });
  await render();
}

void main();
