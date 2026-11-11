import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@shared": path.resolve(import.meta.dirname, "shared") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    env: { DATABASE_PATH: ":memory:", AI_PROVIDER: "mock", NODE_ENV: "test" },
  },
});
