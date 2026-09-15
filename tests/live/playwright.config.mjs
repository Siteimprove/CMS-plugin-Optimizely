import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: '*.spec.mjs', workers: 1, retries: 0, forbidOnly: true,
  timeout: 480_000, expect: { timeout: 30_000 },
  reporter: [['./safe-reporter.mjs']],
  outputDir: 'artifacts/live-private',
  use: { baseURL: 'http://localhost:5000', browserName: 'chromium', headless: true,
    trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block' },
});
