import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // The core from source, so the tests do not depend on its build.
      "@devlooped/plotdown/browser": at("../plotdown/src/browser/index.ts"),
      "@devlooped/plotdown": at("../plotdown/src/index.ts")
    }
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom"
  }
});
