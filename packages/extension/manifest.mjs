// The manifest of each build, written by build.mjs. One source for the three
// stores: Chrome and Edge take the same package; Firefox differs in its
// background (an event page, not a service worker) and its gecko settings.
//
// Two variants of host access:
//   "all"    the default: the detector runs on every http(s) site, so
//            self-hosted GitLab, Gitea and any page work with no setup.
//   "known"  the fallback if the broad permission puts a store or readers off
//            (see the plan's Risks): the manifest lists the known hosts, and
//            the popup asks for any other site one at a time (optional host
//            permission); the background then registers the detector there.
// plotdown.js is the same in both.

/** The hosts the "known" variant covers from the start: the surfaces of route 3 in the plan. */
export const KNOWN_HOSTS = [
  "github.com",
  "gist.github.com",
  "gitlab.com",
  "bitbucket.org",
  "codeberg.org",
  "gitea.com",
  "dev.azure.com",
  "chatgpt.com",
  "claude.ai",
  "gemini.google.com"
];

export const ALL_SITES = ["http://*/*", "https://*/*"];

/** The id of the Firefox add-on (AMO requires one for Manifest V3; it cannot change after the first upload). */
export const GECKO_ID = "plotdown@devlooped.com";

export const DESCRIPTION =
  "Renders plot code blocks of JSON as Observable Plot charts on GitHub, GitLab, AI chats and any page you read.";

/**
 * @param {{browser: "chrome" | "firefox", sites?: "all" | "known", version: string}} options
 * @returns {Record<string, any>}
 */
export function createManifest({browser, sites = "all", version}) {
  const matches = sites === "known" ? KNOWN_HOSTS.map((host) => `https://${host}/*`) : ALL_SITES;
  const icons = {16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 96: "icons/icon-96.png", 128: "icons/icon-128.png"};
  /** @type {Record<string, any>} */
  const manifest = {
    manifest_version: 3,
    name: "plotdown",
    version,
    description: DESCRIPTION,
    homepage_url: "https://github.com/devlooped/plotdown",
    icons,
    action: {
      default_title: "plotdown",
      default_popup: "popup.html",
      default_icon: {16: icons[16], 32: icons[32]}
    },
    background: browser === "firefox" ? {scripts: ["background.js"]} : {service_worker: "background.js"},
    // scripting: inject plotdown.js into a frame that has a block; storage: the
    // switches; activeTab: the popup reads the address of the current tab.
    permissions: ["scripting", "storage", "activeTab"],
    host_permissions: matches,
    content_scripts: [
      {
        matches,
        js: ["content.js"],
        run_at: "document_idle",
        all_frames: true
      }
    ]
  };
  if (sites === "known") manifest.optional_host_permissions = ALL_SITES;
  if (browser === "firefox") {
    manifest.browser_specific_settings = {
      gecko: {
        id: GECKO_ID,
        // 153: content scripts may set adoptedStyleSheets (bug 1751346), so
        // charts keep their styles under a page CSP that refuses <style>
        // elements; before it, plotdown.js falls back to <style>, which such
        // a page blocks. Also MV3 scripting, storage.session and
        // data_collection_permissions (140+).
        strict_min_version: "153.0",
        data_collection_permissions: {required: ["none"]}
      }
    };
  } else {
    // CSS color-mix() in the chart's toolbar; MV3 scripting with func and args.
    manifest.minimum_chrome_version = "111";
  }
  return manifest;
}
