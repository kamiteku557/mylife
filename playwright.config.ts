import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/frontend/e2e",
  timeout: 60_000,
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: {
    command:
      "VITE_API_BASE_URL=http://127.0.0.1:4173 pnpm --filter mylife-frontend dev --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
