import { test, expect } from '@playwright/test';
import { safeDiagnostics } from './diagnostics.mjs';
import { settings, allowedRequest, isReport } from './settings.mjs';

export async function openLiveEditor(page, context) {
  const config = settings(process.env);
  const diagnostic = {};
  try {
    await context.route('**/*', route => {
      if (allowedRequest(route.request().url())) return route.continue();
      diagnostic.blockedExternalRequest = true;
      return route.abort();
    });
    // Read existing entitlement. Never enable a subscription or trigger a recheck.
    await test.step('live: entitlement', async () => {
      const entitlement = await fetch('https://api.siteimprove.com/v2/settings/content_checking', {
        headers: { Authorization: `Basic ${Buffer.from(`${config.SITEIMPROVE_API_USERNAME}:${config.SITEIMPROVE_API_KEY}`).toString('base64')}` },
        redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      diagnostic.entitlementStatus = entitlement.status;
      expect(entitlement.ok).toBe(true);
      diagnostic.entitlementReady = (await entitlement.json()).is_ready === true;
      expect(diagnostic.entitlementReady).toBe(true);
    });

    let reportReceived = false;
    page.on('response', async response => {
      try {
        const url = new URL(response.url());
        if (/^https:\/\/contentassistant\.[a-z]+\.siteimprove\.com$/.test(url.origin)
          && url.pathname === '/cms/poll') {
          diagnostic.pollSeen = true;
          diagnostic.pollStatus = response.status();
          diagnostic.pollOk = response.ok();
          const body = await response.json();
          diagnostic.pollAuthenticated = body?.authed === true;
          diagnostic.pollUrlMatches = url.searchParams.get('url') === config.crawledUrl;
          diagnostic.pollMainUrlPresent = typeof body?.mainUrl === 'string' && body.mainUrl.trim().length > 0;
          diagnostic.pollIssueCountValid = Number.isFinite(body?.issues) && body.issues >= 0;
          diagnostic.pollErrorNone = body?.error === 'None';
          if (diagnostic.pollUrlMatches && response.ok() && isReport(body, url.searchParams.get('url'), config.crawledUrl)) reportReceived = true;
        }
      } catch { /* Invalid or failed responses cannot satisfy report readiness. */ }
    });
    await test.step('live: CMS login', async () => {
      await page.goto('/episerver/cms');
      await page.locator('input[name="Username"], input[name="UserName"]').fill('editor');
      await page.locator('input[name="Password"]').fill(process.env.CMS_EDITOR_PASSWORD);
      await page.getByRole('button', { name: /log in/i }).click();
      await expect(page.locator('input[name="Password"]')).toHaveCount(0);
    });
    const contentId = await test.step('live: public URL mapping', async () => {
      const routesResponse = await page.request.get('/test/routes');
      expect(routesResponse.ok()).toBe(true);
      const { plugin } = await routesResponse.json();
      const targetResponse = await page.request.get('/test/live-target');
      expect(targetResponse.ok()).toBe(true);
      const { contentId } = await targetResponse.json();
      const mapping = await page.request.get(`${plugin}/PageUrl?contentId=${contentId}&locale=en`);
      expect(mapping.ok()).toBe(true);
      expect((await mapping.json()).url).toBe(config.crawledUrl);
      return contentId;
    });
    await test.step('live: draft preview', async () => {
      await page.goto(`/episerver/cms/#context=epi.cms.contentdata:///${contentId}`);
      await expect(page.frameLocator('iframe[name="sitePreview"]').locator('h1')).toBeVisible();
    });

    const popup = await test.step('live: open login popup', async () => {
      const [popup] = await Promise.all([
        page.waitForEvent('popup'), page.locator('.si-smallbox button.si-button').click(),
      ]);
      return popup;
    });
    await test.step('live: identity username', async () => {
      await popup.waitForURL(url => url.origin === 'https://identity.siteimprove.com');
      await popup.locator('input[name=loginId]').fill(config.SITEIMPROVE_USERNAME);
      await popup.getByRole('button', { name: 'Continue', exact: true }).click();
    });
    await test.step('live: identity password', async () => {
      await popup.locator('input[type=password]').waitFor();
      expect(new URL(popup.url()).origin).toBe('https://identity.siteimprove.com');
      await popup.locator('input[type=password]').fill(config.SITEIMPROVE_PASSWORD);
    });
    await test.step('live: submit login', async () => {
      await Promise.all([
        popup.waitForEvent('close', { timeout: 60_000 }),
        popup.getByRole('button', { name: /^(Sign in|Log in|Continue)$/i }).click(),
      ]);
    });
    await test.step('live: mapped report data', async () => {
      await expect.poll(() => reportReceived, { timeout: 60_000 }).toBe(true);
    });
    await test.step('live: report panel', async () => {
      const panel = page.locator('iframe.si-iframe-element');
      if (!await panel.isVisible()) await page.locator('.si-smallbox button.si-button').click();
      await expect(panel).toBeVisible();
    });
    return { config, contentId };
  } finally {
    try {
      const panel = page.locator('iframe.si-iframe-element');
      diagnostic.panelFramePresent = await panel.count() > 0;
      diagnostic.panelVisible = await panel.first().isVisible();
      diagnostic.launcherVisible = await page.locator('.si-smallbox button.si-button').first().isVisible();
    } catch { /* Diagnostics must not replace the original failure. */ }
    test.info().annotations.push({ type: 'live-diagnostics', description: JSON.stringify(safeDiagnostics(diagnostic)) });
  }
}
