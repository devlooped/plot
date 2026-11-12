// A stand-in for the parts of the Obsidian API the plugin uses. The real
// "obsidian" package ships types only; vitest.config.ts aliases it to this file.
import type {MarkdownPostProcessorContext, RequestUrlParam, RequestUrlResponse} from "obsidian";

type Processor = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<unknown> | void;

// Obsidian adds helpers to HTMLElement; the plugin uses empty().
declare global {
  interface HTMLElement {
    empty(): void;
  }
}
if (!HTMLElement.prototype.empty) {
  HTMLElement.prototype.empty = function (this: HTMLElement) {
    this.replaceChildren();
  };
}

export class App {}

export class Component {
  register(_cb: () => unknown): void {}
}

/** The plugin host: records what the plugin registers, keeps its data in memory. */
export class Plugin extends Component {
  settings?: unknown;
  readonly processors = new Map<string, Processor>();
  readonly settingTabs: PluginSettingTab[] = [];
  data: unknown = null;

  constructor(
    readonly app: App = new App(),
    readonly manifest: unknown = {}
  ) {
    super();
  }

  registerMarkdownCodeBlockProcessor(language: string, handler: Processor): void {
    // Obsidian refuses a language that is already registered.
    if (this.processors.has(language) || takenLanguages.has(language)) throw new Error(`Language ${language} is already registered`);
    this.processors.set(language, handler);
  }

  addSettingTab(tab: PluginSettingTab): void {
    this.settingTabs.push(tab);
  }

  async loadData(): Promise<unknown> {
    return this.data === null ? null : structuredClone(this.data);
  }

  async saveData(data: unknown): Promise<void> {
    this.data = structuredClone(data);
  }

  onload(): void | Promise<void> {}
}

/** Languages "another plugin" registered first. */
export const takenLanguages = new Set<string>();

export abstract class PluginSettingTab {
  containerEl: HTMLElement = document.createElement("div");
  constructor(
    readonly app: App,
    readonly plugin: Plugin
  ) {}
  display(): void {}
  hide(): void {}
}

export class ToggleComponent {
  readonly toggleEl = document.createElement("input");
  private callback?: (value: boolean) => unknown;
  constructor(containerEl: HTMLElement) {
    this.toggleEl.type = "checkbox";
    containerEl.append(this.toggleEl);
  }
  getValue(): boolean {
    return this.toggleEl.checked;
  }
  setValue(on: boolean): this {
    this.toggleEl.checked = on;
    return this;
  }
  onChange(callback: (value: boolean) => unknown): this {
    this.callback = callback;
    return this;
  }
  /** What a click does: flips the value and calls back. */
  async click(): Promise<void> {
    this.toggleEl.checked = !this.toggleEl.checked;
    await this.callback?.(this.toggleEl.checked);
  }
}

export class Setting {
  static readonly toggles: ToggleComponent[] = [];
  readonly settingEl = document.createElement("div");
  readonly nameEl = document.createElement("div");
  readonly descEl = document.createElement("div");
  readonly controlEl = document.createElement("div");
  constructor(containerEl: HTMLElement) {
    this.settingEl.className = "setting-item";
    this.settingEl.append(this.nameEl, this.descEl, this.controlEl);
    containerEl.append(this.settingEl);
  }
  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }
  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }
  setHeading(): this {
    return this;
  }
  addToggle(cb: (toggle: ToggleComponent) => unknown): this {
    const toggle = new ToggleComponent(this.controlEl);
    Setting.toggles.push(toggle);
    cb(toggle);
    return this;
  }
}

/** Calls of requestUrl, answered by requestUrlHandler. */
export const requestUrlCalls: RequestUrlParam[] = [];
export let requestUrlHandler: (request: RequestUrlParam) => Promise<RequestUrlResponse> = async () => {
  throw new Error("no requestUrl handler");
};
export function setRequestUrlHandler(handler: typeof requestUrlHandler): void {
  requestUrlHandler = handler;
}

export function requestUrl(request: RequestUrlParam | string): Promise<RequestUrlResponse> {
  const param = typeof request === "string" ? {url: request} : request;
  requestUrlCalls.push(param);
  return requestUrlHandler(param);
}

/** A requestUrl response with a text body. */
export function textResponse(text: string, status = 200, headers: Record<string, string> = {}): RequestUrlResponse {
  const bytes = new TextEncoder().encode(text);
  return {
    status,
    headers,
    arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    text,
    get json() {
      return JSON.parse(text);
    }
  };
}
