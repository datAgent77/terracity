import { defineConfig, devices } from '@playwright/test';

// Desktop browser e2e: drives the real IWSDK app with mouse + keyboard.
// Reuses a running `npm run dev` server (https://localhost:8081) when present.
// E2E_BASE_URL points the suite at another server, e.g. `vite preview` of the
// production build (then no dev server is started).
const external = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: 'tests/e2e',
  // One worker: a WebGL app on a shared dev server; parallel software-rendered
  // pages starve each other of frames and make input timing flaky.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  use: {
    baseURL: external ?? 'https://localhost:8081/',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    ...devices['Desktop Chrome'],
  },
  webServer: external ? undefined : {
    command: 'npm run dev:runtime',
    url: 'https://localhost:8081/',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  outputDir: 'test-results',
});
