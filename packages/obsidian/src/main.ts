import {FENCE_NAMES} from "@devlooped/plotdown";
import {Plugin, requestUrl} from "obsidian";
import {requestUrlFetch} from "./fetch.js";
import {renderBlock} from "./render.js";
import {DEFAULT_SETTINGS, PlotdownSettingTab, type PlotdownSettings} from "./settings.js";

/** Renders plot, oplot and observable-plot code blocks as Observable Plot charts. */
export default class PlotdownPlugin extends Plugin {
  override settings: PlotdownSettings = {...DEFAULT_SETTINGS};

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new PlotdownSettingTab(this.app, this));
    const fetch = requestUrlFetch(requestUrl);
    for (const language of FENCE_NAMES) {
      try {
        this.registerMarkdownCodeBlockProcessor(language, (source, el) =>
          renderBlock(source, el, {allowRemote: this.settings.allowRemote, fetch})
        );
      } catch (error) {
        // Another plugin already handles this language; keep the other names.
        console.error(`plotdown: cannot handle \`\`\`${language} blocks`, error);
      }
    }
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<PlotdownSettings> | null;
    this.settings = {...DEFAULT_SETTINGS, ...data};
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
