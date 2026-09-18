import path from "node:path";
import { defineConfig } from "vitest/config";

// Server-side utility tests run in the node environment. Suites are colocated
// next to their source (src/**/*.test.ts). The "@" alias mirrors tsconfig so a
// suite can exercise a module that imports across the app, which is what the
// content board actions do.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
