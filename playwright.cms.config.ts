import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/cms',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['junit', { outputFile: 'artifacts/evidence/browser-results.xml' }]],
  outputDir: 'artifacts/evidence/browser',
  use: { baseURL: 'http://localhost:5000', browserName: 'chromium', headless: true, trace: 'off' },
});
