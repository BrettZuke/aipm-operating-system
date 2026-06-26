import { defineConfig } from "vitest/config";

// Server-side utility tests run in the node environment. Suites are colocated
// next to their source (src/**/*.test.ts) and use relative imports, so no path
// alias wiring is needed here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
