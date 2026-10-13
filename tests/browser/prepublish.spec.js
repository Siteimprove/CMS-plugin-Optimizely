const { test, expect } = require('@playwright/test');
const http = require('node:http');
const path = require('node:path');

const servers = [];
async function listen(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
test.afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  })));
});

async function setup(page, options = {}) {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.name));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push('console error'); });
  const delivery = await listen((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Published</title><main>PUBLISHED CONTENT</main>');
  });
  const cms = await listen((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/redirect') {
      res.writeHead(302, { Location: `${delivery}/page` });
      return res.end();
    }
    res.setHeader('Content-Type', 'text/html');
    if (url.pathname === '/xfo') res.setHeader('X-Frame-Options', 'DENY');
    if (url.pathname === '/csp') res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    if (url.pathname === '/editor') {
      return res.end('<!doctype html><title>Editor</title><iframe name="sitePreview" src="/preview?id=42&amp;language=en"></iframe>');
    }
    const id = url.searchParams.get('id');
    const text = id?.startsWith('99_') ? `BLOCK DRAFT ${id} ${url.searchParams.get('language')}` : id === '43' ? 'SECOND DRAFT' : 'FIRST DRAFT';
    res.end(`<!doctype html><title>Draft</title><main>${text}</main>`);
  });
  await page.goto(`${cms}/editor`);
  await page.evaluate(({ delivery, options }) => {
    window._si = [];
    window.siteimproveBlockBetaEnabled = options.latestUi !== false;
    window.pendingRequests = [];
    window.requests = [];
    window.subscriptions = {};
    window.epi = { routes: { getActionPath: ({ action }) => `/api/${action}` } };
    // Only the AMD loader, Dojo/CMS services and Siteimprove queue are fixtures.
    // The complete production module and the browser's iframe security run normally.
    window.define = (dependencies, factory) => {
      const request = { get: (url, options) => {
        window.requests.push({ url, options });
        if (url === '/api/pageUrl') {
          const { contentId, locale } = options.query;
          if (contentId === window.failedContentId) return Promise.reject(new Error('Fixture URL lookup failed'));
          const result = { url: `${delivery}/${encodeURIComponent(locale)}/pages/${encodeURIComponent(contentId)}`, isDomain: false };
          if (contentId === window.delayedContentId) return new Promise(resolve => window.pendingRequests.push(() => resolve(result)));
          return Promise.resolve(result);
        }
        if (url === '/api/token') {
          if (window.failedToken) return Promise.reject(new Error('Fixture token lookup failed'));
          if (window.delayToken) return new Promise(resolve => window.pendingRequests.push(() => resolve('fixture-token')));
          return Promise.resolve('fixture-token');
        }
        if (url === '/api/IsAuthorized') return Promise.resolve(true);
        return Promise.reject(new Error(`Unexpected endpoint: ${url}`));
      } };
      const declare = (bases, methods) => methods;
      const topic = { subscribe: (name, callback) => { window.subscriptions[name] = callback; } };
      const methods = factory({}, declare, {}, {}, topic, request, {}, (value, callback) => Promise.resolve(value).then(callback));
      window.plugin = Object.assign({ inherited() {}, getCurrentContext: () => Promise.resolve(options.initialContext || { id: '42_7', language: 'en', capabilities: { isPage: true } }) }, methods);
      window.plugin.initialize();
    };
    window.failedContentId = options.failedContentId;
    window.delayedContentId = options.delayedContentId;
  }, { delivery, options });
  await page.addScriptTag({ path: process.env.SITEIMPROVE_TEST_SCRIPT || path.resolve(__dirname, '../../SiteImprove.Optimizely.Plugin/modules/_protected/SiteImprove.Optimizely.Plugin_files/1.0.5/ClientResources/Scripts/siteimprove.js') });
  await page.waitForFunction(() => window.plugin.isInitialized);
  return { cms, delivery, browserErrors };
}

async function capture(page) {
  return page.evaluate(async () => {
    const callback = window._si.filter(command => command[0] === 'registerPrepublishCallback').at(-1)?.[1];
    if (!callback) return { status: 'null' };
    try {
      const result = await callback(); // No receiver: exercise the actual registered callback.
      const doc = Array.isArray(result) ? result[0] : result;
      const captured = doc ? { status: 'document', text: doc.querySelector('main')?.textContent ?? null, url: doc.URL, ...(Array.isArray(result) ? { type: result[2] } : {}) } : { status: 'null' };
      if (Array.isArray(result)) result[1]();
      return captured;
    } catch (error) {
      return { status: 'throws', name: error.name };
    }
  });
}

test('same-origin preview hands the draft document to Prepublish', async ({ page }) => {
  const { cms } = await setup(page);
  expect(await capture(page)).toEqual({ status: 'document', text: 'FIRST DRAFT', url: `${cms}/preview?id=42&language=en` });
});

test('separate public URL and token are sent while capture stays on the CMS origin', async ({ page }) => {
  const { cms, delivery } = await setup(page);
  await page.evaluate(() => window.subscriptions['/epi/shell/context/changed']({ id: '42_7', language: 'da', capabilities: { isPage: true } }));
  await page.waitForFunction(() => window._si.filter(command => command[0] === 'input').length === 2);
  expect(await page.evaluate(() => window._si.filter(command => command[0] === 'input').at(-1).slice(0, 3)))
    .toEqual(['input', `${delivery}/da/pages/42_7`, 'fixture-token']);
  expect(await page.evaluate(() => window.requests.filter(request => request.url === '/api/pageUrl').at(-1).options.query))
    .toEqual({ contentId: '42_7', locale: 'da' });
  await page.frame({ name: 'sitePreview' }).goto(`${cms}/preview?id=42&language=da`);
  expect(await capture(page)).toMatchObject({ text: 'FIRST DRAFT', url: `${cms}/preview?id=42&language=da` });
});

test('navigation reads the new preview document instead of retaining the previous draft', async ({ page }) => {
  const { cms } = await setup(page);
  expect(await capture(page)).toMatchObject({ text: 'FIRST DRAFT' });
  await page.frame({ name: 'sitePreview' }).goto(`${cms}/preview?id=43&language=da`);
  expect(await capture(page)).toEqual({ status: 'document', text: 'SECOND DRAFT', url: `${cms}/preview?id=43&language=da` });
});

test('replacing the preview iframe reads the replacement document', async ({ page }) => {
  const { cms } = await setup(page);
  await page.evaluate(async url => {
    document.querySelector('iframe').remove();
    const frame = document.createElement('iframe');
    frame.name = 'sitePreview';
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = url;
    document.body.appendChild(frame);
    await loaded;
  }, `${cms}/preview?id=43`);
  expect(await capture(page)).toMatchObject({ text: 'SECOND DRAFT' });
});

test('missing preview iframe returns null', { tag: '@observation' }, async ({ page }) => {
  await setup(page);
  await page.locator('iframe').evaluate(frame => frame.remove());
  expect(await capture(page)).toEqual({ status: 'null' });
});

for (const mode of ['cross-origin', 'redirect', 'xfo', 'csp']) {
  test(`${mode}: characterize the callback when the preview is inaccessible`, { tag: '@observation' }, async ({ page }, testInfo) => {
    const { cms, delivery } = await setup(page);
    const target = mode === 'cross-origin' ? `${delivery}/page` : `${cms}/${mode}`;
    // An iframe load event also fires for browser-blocked documents.
    await page.evaluate(async target => {
      const frame = document.querySelector('iframe');
      await new Promise(resolve => {
        frame.onload = resolve;
        frame.src = target;
      });
    }, target);
    const result = await capture(page);
    await testInfo.attach('callback-observation', { body: JSON.stringify(result), contentType: 'application/json' });
    // Characterization assertion: this proves the failure mode, not graceful UI handling.
    expect(result).toEqual({ status: 'null' });
  });
}

for (const event of ['/epi/shell/context/changed', 'epi/shell/context/request']) {
  test(`context: Page to Block to Page avoids Block URL requests through ${event}`, async ({ page }) => {
    const { cms, delivery, browserErrors } = await setup(page);
    const result = await page.evaluate(async event => {
      const handler = window.subscriptions[event];
      const flush = () => new Promise(resolve => setTimeout(resolve, 0));
      const pageContext = (id, language) => ({ id, language, capabilities: { isPage: true } });
      const requests = () => window.requests.filter(request => request.url === '/api/pageUrl').map(request => request.options.query.contentId);
      await handler(pageContext('42_7', 'en'));
      await flush();
      const beforeBlock = window._si.filter(command => command[0] === 'input').length;
      await handler({ id: '99_4', language: 'en', capabilities: { isPage: false, isBlock: true }, editablePreviewUrl: '/preview?id=99_4&language=en' });
      await flush();
      const afterBlock = window._si.filter(command => command[0] === 'input').length;
      const clears = window._si.filter(command => command[0] === 'clear').map(command => [command[0], command[2]]);
      await handler(pageContext('43_9', 'da'));
      await flush();
      return {
        ids: requests(), beforeBlock, afterBlock, clears,
        inputs: window._si.filter(command => command[0] === 'input').map(command => command.slice(0, 3)),
        queries: window.requests.filter(request => request.url === '/api/pageUrl').map(request => request.options.query),
      };
    }, event);
    expect(result).toEqual({
      ids: ['42_7', '43_9'], beforeBlock: 1, afterBlock: 1, clears: [['clear', 'fixture-token']],
      inputs: [
        ['input', `${delivery}/en/pages/42_7`, 'fixture-token'],
        ['input', `${delivery}/da/pages/43_9`, 'fixture-token'],
      ],
      queries: [{ contentId: '42_7', locale: 'en' }, { contentId: '43_9', locale: 'da' }],
    });
    // Simulate the CMS loading Page B's preview after the context transition.
    // This verifies capture resumes on B; it does not test CMS rendering itself.
    await page.frame({ name: 'sitePreview' }).goto(`${cms}/preview?id=43&language=da`);
    expect(await capture(page)).toEqual({ status: 'document', text: 'SECOND DRAFT', url: `${cms}/preview?id=43&language=da` });
    expect(browserErrors).toEqual([]);
  });
}

test('context: absent or incomplete context clears results without requesting another page URL', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const errors = [];
    const handler = window.subscriptions['/epi/shell/context/changed'];
    for (const context of [null, undefined, {}, { id: 'block-99' }, { id: 'block-99', capabilities: {} }]) {
      try { await handler(context); } catch (error) { errors.push(error.name); }
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    return { errors, urlRequests: window.requests.filter(request => request.url === '/api/pageUrl').length };
  });
  expect(result).toEqual({ errors: [], urlRequests: 1 });
});

test('starting on a Block still allows the first Page to initialize once', async ({ page }) => {
  const { delivery, browserErrors } = await setup(page, { initialContext: { id: '99_4', language: 'en', capabilities: { isPage: false, isBlock: true }, editablePreviewUrl: '/preview?id=99_4&language=en' } });
  expect(await page.evaluate(() => window.requests.filter(request => request.url === '/api/pageUrl'))).toEqual([]);
  await page.evaluate(() => {
    const context = { id: '42_7', language: 'da', capabilities: { isPage: true } };
    window.subscriptions['/epi/shell/context/current'](context);
    window.subscriptions['/epi/shell/context/current'](context);
  });
  await expect.poll(() => page.evaluate(() => window._si.filter(command => command[0] === 'input').map(command => command.slice(0, 3))))
    .toEqual([['input', `${delivery}/da/pages/42_7`, 'fixture-token']]);
  expect(await page.evaluate(() => window.requests.filter(request => request.url === '/api/pageUrl').length)).toBe(1);
  expect(browserErrors).toEqual([]);
});

test('a failed page URL lookup resets the page context and the next Page succeeds', async ({ page }) => {
  const { delivery } = await setup(page, { failedContentId: '42_7', initialContext: { id: '42_7', language: 'en', capabilities: { isPage: true } } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => window.subscriptions['/epi/shell/context/changed']({ id: '42_7', language: 'en', capabilities: { isPage: true } }));
  await expect.poll(() => page.evaluate(() => window._si.filter(command => command[0] === 'input').map(command => command[1])))
    .toEqual(['']);
  await page.evaluate(() => window.subscriptions['/epi/shell/context/changed']({ id: '43_9', language: 'da', capabilities: { isPage: true } }));
  await expect.poll(() => page.evaluate(() => window._si.filter(command => command[0] === 'input').map(command => command.slice(0, 3))))
    .toEqual([['input', '', 'fixture-token'], ['input', `${delivery}/da/pages/43_9`, 'fixture-token']]);
  expect(errors).toEqual([]);
});

test('highlighting is handed the current preview document after navigation', async ({ page }) => {
  const { cms } = await setup(page);
  await page.frame({ name: 'sitePreview' }).goto(`${cms}/preview?id=43`);
  const result = await page.evaluate(() => {
    const highlight = window._si.find(command => command[0] === 'onHighlight')[1];
    const info = { selector: 'main', issueId: 'fixture-issue' };
    highlight(info);
    const command = window._si.find(command => command[0] === 'applyDefaultHighlighting');
    return { info: command[1], text: command[2].querySelector('main').textContent, url: command[2].URL };
  });
  expect(result).toEqual({ info: { selector: 'main', issueId: 'fixture-issue' }, text: 'SECOND DRAFT', url: `${cms}/preview?id=43` });
});

const blockContext = (id = '99_4', language = 'en', preview = `/preview?id=${id}&language=${language}`) => ({
  id, language, capabilities: { isPage: false, isBlock: true }, editablePreviewUrl: preview,
});
const pageContext = (id = '42_7', language = 'en') => ({ id, language, capabilities: { isPage: true } });

async function changeContext(page, content) {
  await page.evaluate(content => window.subscriptions['/epi/shell/context/changed'](content), content);
}

test('direct shared block editing initializes prepublish only and captures its draft on demand', async ({ page }) => {
  const { cms, browserErrors } = await setup(page, { initialContext: blockContext() });
  await expect.poll(() => page.evaluate(() => window._si.filter(c => c[0] === 'clear').map(c => [c[0], c[2]])))
    .toEqual([['clear', 'fixture-token']]);
  expect(await page.evaluate(() => window._si.findIndex(c => c[0] === 'clear') < window._si.findLastIndex(c => c[0] === 'registerPrepublishCallback' && c[1]))).toBe(true);
  expect(await page.evaluate(() => window.requests.filter(r => r.url === '/api/pageUrl'))).toEqual([]);
  expect(await page.evaluate(() => window._si.filter(c => ['input', 'domain', 'recheck'].includes(c[0])))).toEqual([]);
  // The existing visible preview belongs to the previous page, so the callback must render the block.
  expect(await capture(page)).toEqual({ status: 'document', text: 'BLOCK DRAFT 99_4 en', url: `${cms}/preview?id=99_4&language=en&epieditmode=true`, type: 'fragment' });
  await expect(page.locator('iframe[title="Block prepublish preview"]')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test('page to block to page restores full page context and never captures the previous page as a block', async ({ page }) => {
  const { cms, delivery, browserErrors } = await setup(page);
  await changeContext(page, blockContext());
  await expect.poll(() => page.evaluate(() => window._si.filter(c => c[0] === 'clear').length)).toBe(1);
  expect(await capture(page)).toMatchObject({ text: 'BLOCK DRAFT 99_4 en', type: 'fragment' });
  await changeContext(page, pageContext('43_9', 'da'));
  await expect.poll(() => page.evaluate(() => window._si.filter(c => c[0] === 'input').at(-1)?.[1])).toBe(`${delivery}/da/pages/43_9`);
  expect(await capture(page)).toEqual({ status: 'null' });
  await page.frame({ name: 'sitePreview' }).goto(`${cms}/preview?id=43&language=da`);
  expect(await capture(page)).toEqual({ status: 'document', text: 'SECOND DRAFT', url: `${cms}/preview?id=43&language=da` });
  expect(browserErrors).toEqual([]);
});

test('block revisions and languages use the current draft and matching visible previews', async ({ page }) => {
  const { cms } = await setup(page, { initialContext: blockContext() });
  expect(await capture(page)).toMatchObject({ text: 'BLOCK DRAFT 99_4 en', type: 'fragment' });
  await changeContext(page, blockContext('99_5', 'da'));
  await page.frame({ name: 'sitePreview' }).goto(`${cms}/preview?id=99_5&language=da&epieditmode=true`);
  expect(await capture(page)).toEqual({ status: 'document', text: 'BLOCK DRAFT 99_5 da', url: `${cms}/preview?id=99_5&language=da&epieditmode=true`, type: 'fragment' });
  await expect(page.locator('iframe[title="Block prepublish preview"]')).toHaveCount(0);
});

test('late page URL responses cannot replace block prepublish mode', async ({ page }) => {
  await setup(page, { initialContext: pageContext('44_1'), delayedContentId: '44_1' });
  await changeContext(page, blockContext());
  await page.evaluate(() => window.pendingRequests.splice(0).forEach(resolve => resolve()));
  await expect.poll(() => page.evaluate(() => window._si.filter(c => c[0] === 'clear').length)).toBe(1);
  expect(await page.evaluate(() => window._si.filter(c => c[0] === 'input'))).toEqual([]);
  expect(await capture(page)).toMatchObject({ text: 'BLOCK DRAFT 99_4 en', type: 'fragment' });
});

test('late token responses cannot restore a page or clear a newly selected page', async ({ page }) => {
  const { delivery } = await setup(page);
  await page.evaluate(() => { window._si.length = 0; window.delayToken = true; });
  await changeContext(page, pageContext('44_1'));
  await expect.poll(() => page.evaluate(() => window.pendingRequests.length)).toBe(1);
  await changeContext(page, blockContext());
  await expect.poll(() => page.evaluate(() => window.pendingRequests.length)).toBe(2);
  await page.evaluate(() => { window.delayToken = false; });
  await changeContext(page, pageContext('43_9', 'da'));
  await expect.poll(() => page.evaluate(() => window._si.filter(c => c[0] === 'input').at(-1)?.[1])).toBe(`${delivery}/da/pages/43_9`);
  await page.evaluate(() => window.pendingRequests.splice(0).reverse().forEach(resolve => resolve()));
  expect(await page.evaluate(() => window._si.filter(c => ['input', 'clear'].includes(c[0])).map(c => [c[0], c[1]])))
    .toEqual([['input', `${delivery}/da/pages/43_9`]]);
});

for (const mode of ['missing', 'legacy', 'cross-origin', 'media']) {
  test(`${mode} block preview does not offer a scan of unrelated content`, async ({ page }) => {
    const { delivery } = await setup(page, { latestUi: mode !== 'legacy' });
    const content = blockContext();
    if (mode === 'missing') delete content.editablePreviewUrl;
    if (mode === 'cross-origin') content.editablePreviewUrl = `${delivery}/page`;
    if (mode === 'media') content.capabilities = { isPage: false, isBlock: false };
    await changeContext(page, content);
    expect(await capture(page)).toEqual({ status: 'null' });
    await expect.poll(() => page.evaluate(() => window._si.filter(c => c[0] === 'clear').length)).toBe(1);
    expect(await page.evaluate(() => window.requests.filter(r => r.url === '/api/pageUrl').length)).toBe(1);
  });
}

test('a block preview redirect to another origin is rejected and its temporary iframe is removed', async ({ page }) => {
  await setup(page, { initialContext: blockContext('99_4', 'en', '/redirect') });
  expect(await capture(page)).toEqual({ status: 'null' });
  await expect(page.locator('iframe[title="Block prepublish preview"]')).toHaveCount(0);
});

test('switching context cancels an in-flight block preview and disables its retained callback', async ({ page }) => {
  await setup(page, { initialContext: blockContext() });
  const result = await page.evaluate(async () => {
    const callback = window._si.filter(c => c[0] === 'registerPrepublishCallback').at(-1)[1];
    const pending = callback();
    window.subscriptions['/epi/shell/context/changed']({ id: '43_9', language: 'en', capabilities: { isPage: true } });
    return { cancelled: await pending, retained: callback(), frames: document.querySelectorAll('iframe[title="Block prepublish preview"]').length };
  });
  expect(result).toEqual({ cancelled: null, retained: null, frames: 0 });
});

test('a failed token request leaves block scanning disabled without an unhandled error', async ({ page }) => {
  const { browserErrors } = await setup(page);
  await page.evaluate(() => { window.failedToken = true; });
  await changeContext(page, blockContext());
  expect(await capture(page)).toEqual({ status: 'null' });
  expect(browserErrors).toEqual([]);
  await page.evaluate(() => { window.failedToken = false; });
  await changeContext(page, pageContext('43_9'));
  await changeContext(page, blockContext('99_5'));
  await expect.poll(() => page.evaluate(() => window.plugin.prepublishKind)).toBe('block');
  expect(await capture(page)).toMatchObject({ text: 'BLOCK DRAFT 99_5 en', type: 'fragment' });
});

test('page preview mode and edit mode both capture only the selected content', async ({ page }) => {
  const { cms } = await setup(page, { initialContext: { ...pageContext(), editablePreviewUrl: '/preview?id=42&language=en&epieditmode=true', previewUrl: '/preview?id=42&language=en' } });
  expect(await capture(page)).toMatchObject({ text: 'FIRST DRAFT' });
  await changeContext(page, { ...pageContext('43_9', 'da'), editablePreviewUrl: '/preview?id=43&language=da&epieditmode=true', previewUrl: '/preview?id=43&language=da' });
  expect(await capture(page)).toEqual({ status: 'null' });
  await page.frame({ name: 'sitePreview' }).goto(`${cms}/preview?id=43&language=da`);
  expect(await capture(page)).toMatchObject({ text: 'SECOND DRAFT' });
});
