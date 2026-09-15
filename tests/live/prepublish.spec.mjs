import { test, expect } from '@playwright/test';
import { openLiveEditor } from './editor.mjs';
import { settings } from './settings.mjs';
import { observeDraft } from './prepublish.mjs';

async function scan(page, evidence, marker) {
  const overlay = page.frameLocator('iframe.si-iframe-element');
  await overlay.getByRole('tab', { name: /Prepublish/i })
    .or(overlay.getByText('Prepublish view', { exact: true })).first().click();
  const before = evidence[marker];
  await overlay.getByRole('button', { name: /^(Run content check|Recheck draft)$/i }).click();
  await expect(overlay.getByRole('button', { name: /Cancel content check/i })).toBeVisible();
  await expect.poll(() => evidence[marker], { timeout: 60_000 }).toBeGreaterThan(before);
  const deadline = Date.now() + 300_000;
  await expect(overlay.getByRole('button', { name: /^Recheck draft$/i })).toBeVisible({ timeout: 300_000 });
  await expect(overlay.getByRole('button', { name: /Cancel content check/i }))
    .toBeHidden({ timeout: Math.max(1, deadline - Date.now()) });
}

test('prepublish hands off both saved draft revisions and exits the loading state', async ({ page, context }) => {
  test.setTimeout(780_000);
  const config = settings(process.env);
  const marker = process.env.CMS_DRAFT_MARKER;
  const fixedMarker = process.env.CMS_DRAFT_FIXED_MARKER;
  expect(Boolean(marker && fixedMarker && marker !== fixedMarker)).toBe(true);
  const evidence = await observeDraft(context, config.cmsOrigin, [marker, fixedMarker]);
  await openLiveEditor(page, context);
  const preview = page.frameLocator('iframe[name="sitePreview"]');
  await expect(preview.locator('#live-test-marker')).toHaveText(marker);
  expect(await preview.locator('#live-test-image').getAttribute('alt')).toBeNull();
  const publishedPath = new URL(config.crawledUrl).pathname;
  const published = await page.request.get(publishedPath);
  expect(published.ok()).toBe(true);
  expect(await published.text()).not.toContain(marker);
  await test.step('fresh draft is handed to the SDK and leaves the running state', async () => {
    await scan(page, evidence, marker);
  });
  await test.step('saved draft correction is handed to the SDK and leaves the running state', async () => {
    const response = await page.request.post('/test/live-draft/fix', { headers: { 'X-Cms-Test': 'prepublish' } });
    expect(response.ok()).toBe(true);
    const { contentId } = await response.json();
    await page.goto(`/episerver/cms/#context=epi.cms.contentdata:///${contentId}`);
    await expect(preview.locator('#live-test-marker')).toHaveText(fixedMarker);
    await expect(preview.locator('#live-test-image')).toHaveAttribute('alt', 'Blue square for the prepublish test');
    const panel = page.locator('iframe.si-iframe-element');
    if (!await panel.isVisible()) await page.locator('.si-smallbox button.si-button').click();
    await expect(panel).toBeVisible();
    await scan(page, evidence, fixedMarker);
    expect(await (await page.request.get(publishedPath)).text()).not.toContain(fixedMarker);
  });
});

// As in WordPress, loading-state exit alone does not establish scan-result correctness.
test.skip('prepublish reports the missing image alternative and clears it after the fix', async () => {
  // Restore this assertion after verifying the live result schema or UI mapping.
});
