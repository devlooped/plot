import {describe, expect, it} from "vitest";
import {DEFAULT_SETTINGS, isOn, loadSettings, saveSettings, siteOf, withSite, type StorageArea} from "../src/settings.js";

function memoryArea(): StorageArea & {data: Record<string, unknown>} {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key) => (key in data ? {[key]: structuredClone(data[key])} : {}),
    set: async (items) => void Object.assign(data, structuredClone(items))
  };
}

describe("settings", () => {
  it("names a site by its host, for http and https pages only", () => {
    expect(siteOf("https://GitHub.com/devlooped/plotdown?x#y")).toBe("github.com");
    expect(siteOf("http://localhost:8080/a")).toBe("localhost");
    expect(siteOf("chrome://extensions")).toBeNull();
    expect(siteOf("file:///C:/a.html")).toBeNull();
    expect(siteOf(undefined)).toBeNull();
    expect(siteOf("not a url")).toBeNull();
  });

  it("is on everywhere by default", async () => {
    const settings = await loadSettings(memoryArea());
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(isOn(settings, "github.com")).toBe(true);
    expect(isOn(settings, null)).toBe(false);
  });

  it("switches a site off and on again, and keeps it", async () => {
    const area = memoryArea();
    let settings = withSite(await loadSettings(area), "github.com", false);
    await saveSettings(area, settings);
    settings = await loadSettings(area);
    expect(isOn(settings, "github.com")).toBe(false);
    expect(isOn(settings, "gitlab.com")).toBe(true);
    settings = withSite(settings, "github.com", true);
    expect(settings.off).toEqual([]);
  });

  it("the global switch wins over the site's", () => {
    expect(isOn({enabled: false, off: []}, "github.com")).toBe(false);
  });

  it("ignores stored values of the wrong shape", async () => {
    const area = memoryArea();
    area.data.settings = {enabled: "yes", off: ["a.com", 3, null]};
    expect(await loadSettings(area)).toEqual({enabled: true, off: ["a.com"]});
  });
});
