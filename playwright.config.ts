import { defineConfig, devices } from "@playwright/test"
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3215", launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: process.env.CI ? "pnpm start --hostname 127.0.0.1 --port 3215" : "pnpm dev --hostname 127.0.0.1 --port 3215", url: "http://127.0.0.1:3215", reuseExistingServer: !process.env.CI, timeout: 120_000 },
})
