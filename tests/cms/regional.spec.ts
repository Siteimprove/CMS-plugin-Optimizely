import { test, expect } from '@playwright/test';

// This suite uses the installed plugin and CMS router; only external overlay requests are blocked.
test.beforeEach(async ({ page, context }) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === 'localhost'
    ? route.continue() : route.abort('blockedbyclient'));
  await page.goto('/episerver/cms');
  await page.locator('input[name="Username"], input[name="UserName"]').fill('editor');
  await page.locator('input[name="Password"]').fill(process.env.CMS_EDITOR_PASSWORD!);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.locator('input[name="Password"]')).toHaveCount(0);
});

for (const [name, locale] of [['inherited', 'en-US'], ['inherited', 'es-419'],
  ['translated', 'fr-CA'], ['draft', 'fr-CA'], ['replacement', 'en-GB']]) {
  test(`real CMS routing: ${name} ${locale}`, async ({ page }, info) => {
    const response = await page.request.get('/test/regional-targets');
    expect(response.ok()).toBe(true);
    const target = (await response.json()).find((item: any) => item.name === name && item.locale === locale);
    expect(target).toBeDefined();
    expect(target.loadedLanguage).toBe(target.sourceLanguage);
    if (name === 'inherited' || name === 'replacement') expect(target.branches).toEqual(['en']);
    const { plugin } = await (await page.request.get('/test/routes')).json();
    const mapping = await page.request.get(`${plugin}/PageUrl`, { params: { contentId: target.contentId, locale } });
    expect(mapping.ok()).toBe(true);
    const body = await mapping.json();
    expect(body.isDomain).toBe(false);
    expect(body.url).toBeTruthy();
    const returned = new URL(body.url);
    const actual = new URL(target.cmsUrl, 'http://localhost:5000');
    // Mapping may change the origin; the path must still be the real CMS public route.
    expect(returned.pathname).toBe(actual.pathname);
    if (target.path) expect(returned.pathname.toLowerCase()).toBe(target.path);
    expect(returned.search).toBe('');
    const published = await page.request.get(actual.href, { maxRedirects: 0 });
    expect(published.status()).toBe(200);
    expect(await published.text()).toContain(`data-content-language="${target.sourceLanguage}"`);
    if (name === 'draft') {
      expect(target.contentId).toMatch(/_\d+/);
      expect(await published.text()).toContain('French Canadian translation');
      expect(await published.text()).not.toContain('French Canadian draft');
    }
    // Publish-event callers use this same helper overload without an editor locale.
    expect(new URL(target.publishUrl).pathname.toLowerCase()).toBe(name === 'inherited'
      ? '/inherited-regional-page/' : name === 'replacement' ? '/replacement-language-page/' : target.path);
    await info.attach('regional-routing', { body: JSON.stringify({ target, returnedUrl: body.url }, null, 2), contentType: 'application/json' });
  });
}

test('real CMS does not serve a regional page without configured fallback', async ({ page }) => {
  const targets = await (await page.request.get('/test/regional-targets')).json();
  const target = targets.find((item: any) => item.name === 'no-fallback');
  expect(target.branches).toEqual(['en']);
  expect(target.loadedLanguage).toBeNull();
  const response = await page.request.get('/en-us/no-regional-fallback/', { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});
