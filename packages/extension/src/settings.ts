// The switches: one for all sites, and one per site (a host name). Kept in
// storage.local: nothing leaves the browser.

export interface Settings {
  /** The global switch. */
  enabled: boolean;
  /** The sites switched off, by host name. */
  off: string[];
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({enabled: true, off: []});

const KEY = "settings";

/** The part of a storage area the switches use (chrome.storage.local, or a stand-in in tests). */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** The site of a page for the per-site switch: its host name, for http and https pages only. */
export function siteOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Whether plotdown runs on a site. */
export function isOn(settings: Settings, site: string | null): boolean {
  return settings.enabled && site !== null && !settings.off.includes(site);
}

/** The settings with a site switched on or off. */
export function withSite(settings: Settings, site: string, on: boolean): Settings {
  const off = settings.off.filter((other) => other !== site);
  if (!on) off.push(site);
  return {...settings, off: off.sort()};
}

export async function loadSettings(area: StorageArea): Promise<Settings> {
  const stored = (await area.get(KEY))[KEY] as Partial<Settings> | undefined;
  return {
    enabled: typeof stored?.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
    off: Array.isArray(stored?.off) ? stored.off.filter((site): site is string => typeof site === "string") : []
  };
}

export async function saveSettings(area: StorageArea, settings: Settings): Promise<void> {
  await area.set({[KEY]: {enabled: settings.enabled, off: settings.off}});
}
