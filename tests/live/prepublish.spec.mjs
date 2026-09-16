import { test, expect } from '@playwright/test';
import { openLiveEditor } from './editor.mjs';
import { settings } from './settings.mjs';
import { observeDraft } from './prepublish.mjs';
import { openAccessibilityResults, openPrepublishOverview, resultViewState } from './result-view.mjs';
import { publicSdkAsset } from './diagnostics.mjs';
import { imageAlternativeRule } from './accessibility-rule.mjs';

async function scan(page, evidence, marker) {
  const overlay = page.frameLocator('iframe.si-iframe-element');
  const before = evidence[marker];
  await test.step('live: start prepublish', async () => {
    await openPrepublishOverview(overlay);
    await overlay.getByRole('button', { name: /^(Run content check|Recheck draft)$/i }).click({ timeout: 30_000 });
    await expect(overlay.getByRole('button', { name: /Cancel content check/i })).toBeVisible();
  });
  await test.step('live: draft handoff', async () => {
    await expect.poll(() => evidence[marker], { timeout: 60_000 }).toBeGreaterThan(before);
  });
  await test.step('live: loading-state exit', async () => {
    const deadline = Date.now() + 300_000;
    await expect(overlay.getByRole('button', { name: /^Recheck draft$/i })).toBeVisible({ timeout: 300_000 });
    await expect(overlay.getByRole('button', { name: /Cancel content check/i }))
      .toBeHidden({ timeout: Math.max(1, deadline - Date.now()) });
  });
}

test('prepublish detects WCAG 1.1.1 image alternative issue and clears it after a saved fix', async ({ page, context }) => {
  test.setTimeout(780_000);
  const config = settings(process.env);
  const marker = process.env.CMS_DRAFT_MARKER;
  const fixedMarker = process.env.CMS_DRAFT_FIXED_MARKER;
  expect(Boolean(marker && fixedMarker && marker !== fixedMarker)).toBe(true);
  const evidence = await observeDraft(context, config.cmsOrigin, [marker, fixedMarker]);
  const sdkAssets = new Set();
  const progress = { firstIssueDetected: false, fixedDraftSaved: false, fixedIssueCleared: false };
  page.on('response', response => {
    const asset = publicSdkAsset(response.url());
    if (asset) sdkAssets.add(asset);
  });
  await openLiveEditor(page, context);
  try {
    const preview = page.frameLocator('iframe[name="sitePreview"]');
    await expect(preview.locator('#live-test-marker')).toHaveText(marker);
    await expect(preview.locator('img')).toHaveCount(1);
    expect(await preview.locator('#live-test-image').getAttribute('alt')).toBeNull();
    const publishedPath = new URL(config.crawledUrl).pathname;
    const published = await page.request.get(publishedPath);
    expect(published.ok()).toBe(true);
    expect(await published.text()).not.toContain(marker);
    await test.step('fresh draft is handed to the SDK and leaves the running state', async () => {
      await scan(page, evidence, marker);
      await test.step('live: accessibility results', async () => {
        await openAccessibilityResults(page.frameLocator('iframe.si-iframe-element'));
      });
      await test.step('live: WCAG 1.1.1 issue detected', async () => {
        const overlay = page.frameLocator('iframe.si-iframe-element');
        await expect(overlay.getByText(imageAlternativeRule.label, { exact: true })).toBeVisible();
        progress.firstIssueDetected = true;
      });
    });
    await test.step('saved draft correction is handed to the SDK and leaves the running state', async () => {
      const response = await page.request.post('/test/live-draft/fix', { headers: { 'X-Cms-Test': 'prepublish' } });
      expect(response.ok()).toBe(true);
      const { contentId } = await response.json();
      await page.goto(`/episerver/cms/#context=epi.cms.contentdata:///${contentId}`);
      await expect(preview.locator('#live-test-marker')).toHaveText(fixedMarker);
      await expect(preview.locator('#live-test-image')).toHaveAttribute('alt', 'Blue square for the prepublish test');
      progress.fixedDraftSaved = true;
      const panel = page.locator('iframe.si-iframe-element');
      if (!await panel.isVisible()) await page.locator('.si-smallbox button.si-button').click();
      await expect(panel).toBeVisible();
      await scan(page, evidence, fixedMarker);
      await test.step('live: accessibility results', async () => {
        await openAccessibilityResults(page.frameLocator('iframe.si-iframe-element'));
      });
      await test.step('live: WCAG 1.1.1 issue cleared', async () => {
        const overlay = page.frameLocator('iframe.si-iframe-element');
        // Require the results section to remain visible and reject an error alert.
        await expect(overlay.getByText('Accessibility', { exact: true }).first()).toBeVisible();
        await expect(overlay.getByRole('alert').filter({ visible: true })).toHaveCount(0);
        await expect(overlay.getByText(imageAlternativeRule.label, { exact: true })).toHaveCount(0);
        progress.fixedIssueCleared = true;
      });
      expect(await (await page.request.get(publishedPath)).text()).not.toContain(fixedMarker);
    });
  } finally {
    test.info().annotations.push({ type: 'live-diagnostics', description: JSON.stringify({ ...progress, sdkAssets: [...sdkAssets],
      firstDraftImagePresent: evidence.captures[marker].imagePresent,
      fixedDraftImagePresent: evidence.captures[fixedMarker].imagePresent,
      fixedDraftAlternativePresent: evidence.captures[fixedMarker].fixedAlternativePresent }) });
    try {
      const state = await resultViewState(page.frameLocator('iframe.si-iframe-element'));
      test.info().annotations.push({ type: 'live-diagnostics', description: JSON.stringify(state) });
    } catch { /* Diagnostic collection must not hide the original result. */ }
  }
});
