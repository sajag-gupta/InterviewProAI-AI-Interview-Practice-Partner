import "dotenv/config";
import { defineConfig } from "@playwright/test";

// The mock AI provider keeps these tests offline and deterministic. The database is a throwaway file.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5055",
    // Fake microphone so voice-mode tests run without hardware or a permission prompt.
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  webServer: {
    command: "rm -f /tmp/ipai-e2e.db* && npm run dev",
    url: "http://localhost:5055/api/health",
    reuseExistingServer: false,
    env: { PORT: "5055", AI_PROVIDER: "mock", DATABASE_PATH: "/tmp/ipai-e2e.db" },
  },
});
