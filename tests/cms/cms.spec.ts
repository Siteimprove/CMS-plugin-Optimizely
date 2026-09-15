import { test as base, expect, Page } from '@playwright/test';
import fs from 'node:fs';

const overlay = fs.readFileSync('tests/cms/overlay-stub.js', 'utf8');
const test = base.extend<{ evidence: string[] }>({
  evidence: [async ({ page, context }, use, info) => {
    const messages: string[] = [];
    page.on('pageerror', error => messages.push(`pageerror: ${error.name}`));
    page.on('console', message => { if (message.type() === 'error') messages.push('browser console error'); });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.hostname === 'localhost' && response.status() >= 400)
        messages.push(`${response.status()} ${url.pathname}`);
    });
    // Fail closed for browser egress. Neither mutable CDN code nor real reports are loaded.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdn.siteimprove.net' && /^\/cms\/overlay-(latest|v1)\.js$/.test(url.pathname))
        return route.fulfill({ contentType: 'application/javascript', body: overlay });
      if (url.hostname !== 'localhost') return route.abort('blockedbyclient');
      if (url.pathname === '/__overlay_stub/recheck') return route.fulfill({ status: 204 });
      return route.continue();
    });
    await use(messages);
    if (info.status !== info.expectedStatus) {
      await page.screenshot({ path: info.outputPath('failure.png'), fullPage: true });
      await info.attach('browser-errors', { body: messages.join('\n'), contentType: 'text/plain' });
      await context.tracing.stop({ path: info.outputPath('trace.zip') }).catch(() => {});
    } else await context.tracing.stop().catch(() => {});
  }, { auto: true }],
});

// These scenarios share persisted CMS configuration established by the first test.
test.describe.configure({ mode: 'serial' });

async function login(page: Page, username = 'editor') {
  await page.goto('/episerver/cms');
  await page.locator('input[name="Username"], input[name="UserName"]').fill(username);
  await page.locator('input[name="Password"]').fill(process.env.CMS_EDITOR_PASSWORD!);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.locator('input[name="Password"]')).toHaveCount(0);
  // Authentication credentials must not be captured in retained traces.
  await page.context().tracing.start({ screenshots: true, snapshots: true });
}

async function selectPage(page: Page, name: string) {
  const firstPage = page.getByRole('treeitem').filter({ has: page.getByText('First page', { exact: true }) }).last();
  if (!await firstPage.isVisible())
    await page.getByRole('button', { name: 'Toggle navigation pane', exact: true }).click();
  await expect(firstPage).toBeVisible();
  if (name === 'Second page' && await firstPage.getAttribute('aria-expanded') === 'false') {
    await firstPage.focus();
    await firstPage.press('ArrowRight');
  }
  await page.getByRole('treeitem').filter({ has: page.getByText(name, { exact: true }) }).last().dblclick();
  await expect(page.frameLocator('iframe[name="sitePreview"]').locator('h1')).toHaveText(name);
}

test('configuration UI persists settings and prepublish status', async ({ page }) => {
  await login(page);
  await page.goto((await (await page.request.get('/test/routes')).json()).admin);
  await page.locator('#ApiUser').fill('stub-user');
  await page.locator('#ApiKey').fill('stub-key');
  await page.locator('#LatestUI').check();
  await page.locator('#Recheck').uncheck();
  await page.locator('input[name="urlMap[0].key"]').fill('http://localhost:5000/');
  await page.locator('input[name="urlMap[0].value"]').fill('https://public-test.example.invalid/');
  const saved = page.waitForResponse(response => response.request().method() === 'GET'
    && new URL(response.url()).pathname.endsWith('/SiteimproveAdmin') && response.status() === 200);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await (await saved).finished();
  await page.waitForLoadState('load');
  await expect(page.locator('#ApiUser')).toHaveValue('stub-user');
  await page.reload();
  await expect(page.locator('#ApiUser')).toHaveValue('stub-user');
  await expect(page.locator('#ApiKey')).toHaveValue('stub-key');
  await expect(page.locator('#LatestUI')).toBeChecked();
  await expect(page.locator('input[name="urlMap[0].value"]')).toHaveValue('https://public-test.example.invalid/');
  const enable = page.getByRole('button', { name: 'Enable pre-publish check', exact: true });
  await expect(enable).toBeVisible();
  await enable.click();
  await expect(page.getByText('Pre-publish check', { exact: true }).locator('..'))
    .toHaveText(/Pre-publish check\s*Enabled/);
});

test('installed module loads, changes page context, and supplies the current preview', async ({ page, evidence }) => {
  await login(page);
  await selectPage(page, 'First page');
  await expect(page.locator('#overlay-context')).toContainText('https://public-test.example.invalid/');
  const first = await page.locator('#overlay-context').textContent();
  await selectPage(page, 'Second page');
  await expect(page.locator('#overlay-context')).toContainText('/second-page');
  const second = await page.locator('#overlay-context').textContent();
  expect(second).not.toBe(first);
  const request = page.waitForRequest(r => new URL(r.url()).pathname === '/__overlay_stub/recheck');
  await page.getByRole('button', { name: 'Stub Recheck', exact: true }).click();
  expect(JSON.parse((await request).postData()!)).toEqual({ url: second });
  await page.getByRole('button', { name: 'Inspect preview callback' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__overlayEvidence.previewHeadings)).toEqual(['Second page']);
  for (const name of ['First page', 'Second page', 'First page']) await selectPage(page, name);
  expect(await page.evaluate(() => (window as any).__overlayEvidence.rechecks)).toEqual([second]);
  expect(await page.evaluate(() => (window as any).__overlayEvidence.commands.filter((x: string) => x === 'registerPrepublishCallback').length)).toBe(1);
  await expect(page.locator('#controlled-overlay')).toHaveCount(1);
  await page.reload();
  await selectPage(page, 'First page');
  await expect(page.locator('#controlled-overlay')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__overlayEvidence.commands.filter((x: string) => x === 'registerPrepublishCallback').length)).toBe(1);
  expect(evidence.filter(x => /[45]\d\d .*SiteImprove/i.test(x))).toEqual([]);
  expect(evidence.filter(x => x.startsWith('pageerror'))).toEqual([]);
});

test('delayed overlay can initialize with current context', async ({ page, context }) => {
  await context.route('https://cdn.siteimprove.net/cms/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fulfill({ contentType: 'application/javascript', body: overlay });
  });
  await login(page);
  await selectPage(page, 'Second page');
  await expect(page.locator('#overlay-context')).toContainText('/second-page');
  await expect(page.locator('#controlled-overlay')).toHaveCount(1);
});

test('failed overlay leaves the CMS usable without claiming report readiness', async ({ page, context }) => {
  await context.route('https://cdn.siteimprove.net/cms/**', route => route.abort('failed'));
  await login(page);
  await selectPage(page, 'First page');
  await expect(page.locator('#controlled-overlay')).toHaveCount(0);
  // The plugin has no dedicated overlay error/retry UI. Recovery requires a reload.
  await context.unroute('https://cdn.siteimprove.net/cms/**');
  await page.reload();
  await selectPage(page, 'Second page');
  await expect(page.locator('#overlay-context')).toContainText('/second-page');
});

test('authenticated editor without an allowed plugin role is denied', async ({ page }) => {
  await login(page, 'restricted');
  const { plugin } = await (await page.request.get('/test/routes')).json();
  for (const action of ['IsAuthorized', 'Token', 'PageUrl?contentId=1&locale=en']) {
    const response = await page.request.get(`${plugin}/${action}`, { maxRedirects: 0 });
    expect([302, 403]).toContain(response.status());
    if (response.status() === 302) expect(response.headers().location).toMatch(/accessdenied|login/i);
  }
  await page.goto((await (await page.request.get('/test/routes')).json()).admin);
  await expect(page.locator('#ApiKey')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__overlayEvidence?.commands.filter((x: string) => x === 'registerPrepublishCallback').length ?? 0)).toBe(0);
});


test('prepublish fixture preserves published content while draft edits persist', async ({ page }) => {
  await login(page);
  const target = await page.request.get('/test/live-target');
  expect(target.ok()).toBe(true);
  const { contentId } = await target.json();
  await page.goto(`/episerver/cms/#context=epi.cms.contentdata:///${contentId}`);
  const preview = page.frameLocator('iframe[name="sitePreview"]');
  await expect(preview.locator('#live-test-marker')).toHaveText(process.env.CMS_DRAFT_MARKER!);
  expect(await preview.locator('#live-test-image').getAttribute('alt')).toBeNull();
  const published = await page.request.get('/draft-test-page/');
  expect(published.ok()).toBe(true);
  expect(await published.text()).not.toContain(process.env.CMS_DRAFT_MARKER!);
  const fixed = await page.request.post('/test/live-draft/fix', { headers: { 'X-Cms-Test': 'prepublish' } });
  expect(fixed.ok()).toBe(true);
  const updated = await fixed.json();
  await page.goto(`/episerver/cms/#context=epi.cms.contentdata:///${updated.contentId}`);
  await expect(preview.locator('#live-test-marker')).toHaveText(process.env.CMS_DRAFT_FIXED_MARKER!);
  await expect(preview.locator('#live-test-image')).toHaveAttribute('alt', 'Blue square for the prepublish test');
  expect(await (await page.request.get('/draft-test-page/')).text()).not.toContain(process.env.CMS_DRAFT_FIXED_MARKER!);
});
