// @vitest-environment node
// esbuild refuses to run under jsdom (its TextEncoder is not Node's), so these run in Node.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as esbuild from "esbuild";
import {describe, expect, it} from "vitest";
// @ts-expect-error: a .mjs module without declarations
import {buildOptions} from "../build.options.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("release files", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const versions = JSON.parse(fs.readFileSync(path.join(root, "versions.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  it("has a manifest the community list accepts", () => {
    expect(manifest.id).toBe("plotdown");
    expect(manifest.id).not.toMatch(/obsidian/i);
    expect(manifest.name).not.toMatch(/obsidian/i);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.isDesktopOnly).toBe(false);
    expect(manifest.description.length).toBeLessThanOrEqual(250);
    expect(manifest.description).toMatch(/\.$/);
    expect(manifest.description).not.toMatch(/obsidian|this plugin/i);
  });

  it("keeps package.json, manifest.json and versions.json in step", () => {
    expect(pkg.version).toBe(manifest.version);
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });

  it("has the same manifest.json and versions.json at the root of the repository, where Obsidian reads them", () => {
    const repo = path.resolve(root, "../..");
    expect(JSON.parse(fs.readFileSync(path.join(repo, "manifest.json"), "utf8"))).toEqual(manifest);
    expect(JSON.parse(fs.readFileSync(path.join(repo, "versions.json"), "utf8"))).toEqual(versions);
  });

  it("has a LICENSE at the root of the repository", () => {
    const repo = path.resolve(root, "../..");
    expect(fs.readFileSync(path.join(repo, "LICENSE"), "utf8")).toMatch(/MIT License/);
  });

  it("bundles into one main.js that needs nothing but obsidian (mobile has no Node)", async () => {
    const result = await esbuild.build({...buildOptions(), absWorkingDir: root, write: false, logLevel: "silent"});
    const main = result.outputFiles!.find((f) => f.path.endsWith("main.js"))!.text;
    const required = new Set([...main.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]));
    expect([...required]).toEqual(["obsidian"]);
    expect(main).not.toMatch(/\bprocess\.versions\b|__dirname/);
  }, 30_000);
});