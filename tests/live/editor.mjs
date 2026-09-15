import { expect } from '@playwright/test';
import { settings, allowedRequest, isReport } from './settings.mjs';

export async function openLiveEditor(page, context) {
  const config = settings(process.env);
  await context.route('**/*', route => allowedRequest(route.request().url()) ? route.continue() : route.abort());
  // Read existing entitlement. Never enable a subscription or trigger a recheck.
  const entitlement = await fetch('https://api.siteimprove.com/v2/settings/content_checking', {
    headers: { Authorization: `Basic ${Buffer.from(`${config.SITEIMPROVE_API_USERNAME}:${config.SITEIMPROVE_API_KEY}`).toString('base64')}` },
    redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  expect(entitlement.ok).toBe(true);
  expect((await entitlement.json()).is_ready).toBe(true);

  let reportReceived = false;
  page.on('response', async response => {
    try {
      const url = new URL(response.url());
      if (/^https:\/\/contentassistant\.[a-z]+\.siteimprove\.com$/.test(url.origin)
        && url.pathname === '/cms/poll' && url.searchParams.get('url') === config.crawledUrl && response.ok()
        && isReport(await response.json(), config.crawledUrl)) reportReceived = true;
    } catch { /* Invalid or failed responses cannot satisfy report readiness. */ }
  });
  await page.goto('/episerver/cms');
  await page.locator('input[name="Username"], input[name="UserName"]').fill('editor');
  await page.locator('input[name="Password"]').fill(process.env.CMS_EDITOR_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.locator('input[name="Password"]')).toHaveCount(0);
  const routesResponse = await page.request.get('/test/routes');
  expect(routesResponse.ok()).toBe(true);
  const { plugin } = await routesResponse.json();
  const targetResponse = await page.request.get('/test/live-target');
  expect(targetResponse.ok()).toBe(true);
  const { contentId } = await targetResponse.json();
  const mapping = await page.request.get(`${plugin}/PageUrl?contentId=${contentId}&locale=en`);
  expect(mapping.ok()).toBe(true);
  expect((await mapping.json()).url).toBe(config.crawledUrl);
  await page.goto(`/episerver/cms/#context=epi.cms.contentdata://${contentId}`);
  await expect(page.frameLocator('iframe[name="sitePreview"]').locator('h1')).toBeVisible();

  const [popup] = await Promise.all([
    page.waitForEvent('popup'), page.locator('.si-smallbox button.si-button').click(),
  ]);
  await popup.waitForURL(url => url.origin === 'https://identity.siteimprove.com');
  await popup.locator('input[name=loginId]').fill(config.SITEIMPROVE_USERNAME);
  await popup.getByRole('button', { name: 'Continue', exact: true }).click();
  await popup.locator('input[type=password]').waitFor();
  expect(new URL(popup.url()).origin).toBe('https://identity.siteimprove.com');
  await popup.locator('input[type=password]').fill(config.SITEIMPROVE_PASSWORD);
  await Promise.all([
    popup.waitForEvent('close', { timeout: 60_000 }),
    popup.getByRole('button', { name: /^(Sign in|Log in|Continue)$/i }).click(),
  ]);
  const panel = page.locator('iframe.si-iframe-element');
  if (!await panel.isVisible()) await page.locator('.si-smallbox button.si-button').click();
  await expect(panel).toBeVisible();
  await expect.poll(() => reportReceived, { timeout: 60_000 }).toBe(true);
  return { config, contentId };
}
