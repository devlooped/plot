import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // The real "obsidian" package has types only; the tests use a stand-in.
      obsidian: at("./test/obsidian-stub.ts"),
      // The core from source, so the tests do not depend on its build.
      "@devlooped/plotdown": at("../plotdown/src/index.ts")
    }
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom"
  }
});
