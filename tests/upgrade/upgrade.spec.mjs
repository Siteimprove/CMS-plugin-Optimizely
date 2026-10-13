import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const phase = process.env.CMS_UPGRADE_PHASE;
const snapshotPath = 'artifacts/evidence/upgrade-snapshot.json';
const overlay = fs.readFileSync('tests/cms/overlay-stub.js', 'utf8');

test('package upgrade preserves configuration, identity and draft content', async ({ page, context }) => {
  expect(['before', 'after']).toContain(phase);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.siteimprove.net' && /^\/cms\/overlay-(latest|v1)\.js$/.test(url.pathname))
      return route.fulfill({ contentType: 'application/javascript', body: overlay });
    if (url.origin !== 'http://localhost:5000') return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto('/episerver/cms');
  await page.locator('input[name="Username"], input[name="UserName"]').fill('editor');
  await page.locator('input[name="Password"]').fill(process.env.CMS_EDITOR_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.locator('input[name="Password"]')).toHaveCount(0);
  const response = await page.request.get('/test/upgrade-settings');
  expect(response.ok()).toBe(true);
  const current = await response.json();
  expect(current.version).toBe(process.env.CMS_EXPECTED_VERSION.split('-')[0]);
  expect(current.settings).toMatchObject({
    token: 'upgrade-preserved-token', recheck: true, latestUI: true,
    apiUser: 'upgrade-api-user', apiKey: 'upgrade-api-key',
    urlMap: {
      'http://localhost:5000/': 'https://upgrade.example.invalid/',
      'https://secondary.example.invalid/': 'https://mapped.example.invalid/',
    },
  });
  expect(current.settings.recordId).toBeTruthy();
  let contentId;
  if (phase === 'before') {
    const target = await page.request.get('/test/live-target');
    expect(target.ok()).toBe(true);
    ({ contentId } = await target.json());
  } else {
    const previous = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    expect(current.version).not.toBe(previous.version);
    expect(current.settings).toEqual(previous.settings);
    contentId = previous.contentId;
    await page.goto((await (await page.request.get('/test/routes')).json()).admin);
    await expect(page.locator('#ApiUser')).toHaveValue('upgrade-api-user');
    await expect(page.locator('#ApiKey')).toHaveValue('upgrade-api-key');
    await expect(page.locator('#Recheck')).toBeChecked();
    await expect(page.locator('#LatestUI')).toBeChecked();
  }
  await page.goto(`/episerver/cms/#context=epi.cms.contentdata:///${contentId}`);
  const preview = page.frameLocator('iframe[name="sitePreview"]');
  await expect(preview.locator('#live-test-marker')).toHaveText(process.env.CMS_DRAFT_MARKER);
  expect(await preview.locator('#live-test-image').getAttribute('alt')).toBeNull();
  const published = await page.request.get('/draft-test-page/');
  expect(published.ok()).toBe(true);
  expect(await published.text()).not.toContain(process.env.CMS_DRAFT_MARKER);
  if (phase === 'after') {
    await expect(page.locator('#overlay-context')).toContainText('https://upgrade.example.invalid/draft-test-page');
    await page.getByRole('button', { name: 'Inspect preview callback' }).click();
    await expect.poll(() => page.evaluate(() => window.__overlayEvidence.previewHeadings))
      .toEqual([await preview.locator('h1').innerText()]);
  } else {
    fs.writeFileSync(snapshotPath, JSON.stringify({ ...current, contentId }, null, 2) + '\n');
  }
});
