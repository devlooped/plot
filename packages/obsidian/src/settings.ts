import {PluginSettingTab, Setting, type App} from "obsidian";
import type PlotdownPlugin from "./main.js";

export interface PlotdownSettings {
  /** Whether blocks may load data URLs and images from the network. */
  allowRemote: boolean;
}

export const DEFAULT_SETTINGS: PlotdownSettings = {
  allowRemote: false
};

export class PlotdownSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: PlotdownPlugin
  ) {
    super(app, plugin);
  }

  override display(): void {
    const {containerEl} = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("Load remote data")
      .setDesc(
        "Let charts load data files and images from the internet (data URLs and image marks). Off by default: a note from someone else could otherwise make requests when you open it. Reopen a note to apply the change."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.allowRemote).onChange(async (value) => {
          this.plugin.settings.allowRemote = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
