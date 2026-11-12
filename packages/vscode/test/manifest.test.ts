// @vitest-environment node
import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(root + path, "utf8");
const manifest = JSON.parse(read("package.json"));
const build = read("scripts/build.mjs");

/** The files of dist/ that scripts/build.mjs writes, from its entry points. */
function built(path: string): boolean {
  const match = /^\.\/dist\/(?:(web)\/)?([\w-]+)\.js$/.exec(path);
  if (!match) return false;
  return build.includes(match[1] ? 'outdir: "dist/web"' : 'outdir: "dist"') && new RegExp("[{ ,\"]" + match[2] + "\"?:").test(build);
}

describe("the extension manifest", () => {
  it("is the devlooped.plotdown extension", () => {
    expect(manifest.publisher).toBe("devlooped");
    expect(manifest.name).toBe("plotdown");
    expect(existsSync(root + manifest.icon)).toBe(true);
    for (const file of ["readme.md", "changelog.md", "media/preview.css", "../../LICENSE"]) expect(existsSync(root + file), file).toBe(true);
  });

  it("points to scripts that the build writes", () => {
    const paths = [
      manifest.main,
      manifest.browser,
      ...manifest.contributes["markdown.previewScripts"],
      ...manifest.contributes.notebookRenderer.map((r: {entrypoint: string | {path: string}}) => (typeof r.entrypoint === "string" ? r.entrypoint : r.entrypoint.path))
    ];
    for (const path of paths) expect(built(path), path).toBe(true);
  });

  it("does not use API newer than the VS Code it requires", () => {
    const engine = manifest.engines.vscode.replace(/^\^/, "");
    expect(manifest.devDependencies["@types/vscode"]).toBe(engine);
  });

  it("restricts the remote setting in workspaces that are not trusted", () => {
    expect(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations).toContain("plotdown.allowRemoteData");
    expect(manifest.contributes.configuration.properties["plotdown.allowRemoteData"].default).toBe(false);
  });

  it("packs only what the extension needs", () => {
    const ignore = read(".vscodeignore").split(/\r?\n/);
    expect(ignore[0]).toBe("**");
    expect(ignore).toContain("!dist/**");
  });
});
