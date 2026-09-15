import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['junit', { outputFile: `artifacts/evidence/upgrade-${process.env.CMS_UPGRADE_PHASE}.xml` }]],
  outputDir: 'artifacts/upgrade-browser',
  use: { baseURL: 'http://localhost:5000', browserName: 'chromium', trace: 'off', serviceWorkers: 'block' },
});
