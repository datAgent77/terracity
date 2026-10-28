import { defineConfig, devices } from '@playwright/test';

// Desktop browser e2e: drives the real IWSDK app with mouse + keyboard.
// Reuses a running `npm run dev` server (https://localhost:8081) when present.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'https://localhost:8081/',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev:runtime',
    url: 'https://localhost:8081/',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  outputDir: 'test-results',
});
