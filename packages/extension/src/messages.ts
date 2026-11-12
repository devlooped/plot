// What the parts of the extension say to each other.

/** Sent by the detector of a frame that holds a candidate block. */
export const FOUND = "plotdown:found";

export interface FoundMessage {
  type: typeof FOUND;
}

/** The answer of the background to FOUND. */
export interface InjectResult {
  injected: boolean;
  /** Why it was not injected: "off" (switched off for the site or everywhere), or an error. */
  reason?: string;
}

/** The file of plotdown.js inside the extension, copied from packages/plotdown/dist at build time. */
export const PLOTDOWN_FILE = "plotdown.iife.js";

/** The options plotdown.js runs with in the extension. Remote data stays off. */
export const PLOTDOWN_CONFIG = Object.freeze({auto: true, allowRemote: false});

/** One injection of plotdown.js, kept in storage.session for the popup and the tests. */
export interface Injection {
  tabId: number;
  frameId: number;
  url: string;
  time: number;
}

/** The key of the list of injections in storage.session. */
export const INJECTIONS = "injections";

/** The id of the content script registered for sites granted one at a time (known-hosts build). */
export const GRANTED_SCRIPT_ID = "plotdown-granted";
