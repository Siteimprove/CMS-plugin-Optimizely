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
    res.end(`<!doctype html><title>Draft</title><main>${url.searchParams.get('id') === '43' ? 'SECOND DRAFT' : 'FIRST DRAFT'}</main>`);
  });
  await page.goto(`${cms}/editor`);
  await page.evaluate(({ delivery, options }) => {
    window._si = [];
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
          return Promise.resolve({ url: `${delivery}/${encodeURIComponent(locale)}/pages/${encodeURIComponent(contentId)}`, isDomain: false });
        }
        if (url === '/api/token') return Promise.resolve('fixture-token');
        if (url === '/api/IsAuthorized') return Promise.resolve(true);
        return Promise.reject(new Error(`Unexpected endpoint: ${url}`));
      } };
      const declare = (bases, methods) => methods;
      const topic = { subscribe: (name, callback) => { window.subscriptions[name] = callback; } };
      const methods = factory({}, declare, {}, {}, topic, request, {}, (value, callback) => Promise.resolve(value).then(callback));
      window.plugin = Object.assign({ inherited() {}, getCurrentContext: () => Promise.resolve(options.initialContext || { capabilities: { isPage: false } }) }, methods);
      window.plugin.constructor();
      window.plugin.initialize();
    };
    window.failedContentId = options.failedContentId;
  }, { delivery, options });
  await page.addScriptTag({ path: process.env.SITEIMPROVE_TEST_SCRIPT || path.resolve(__dirname, '../../SiteImprove.Optimizely.Plugin/modules/_protected/SiteImprove.Optimizely.Plugin_files/1.0.5/ClientResources/Scripts/siteimprove.js') });
  await page.waitForFunction(() => window._si.some(command => command[0] === 'registerPrepublishCallback'));
  return { cms, delivery };
}

async function capture(page) {
  return page.evaluate(() => {
    const callback = window._si.find(command => command[0] === 'registerPrepublishCallback')[1];
    try {
      const doc = callback(); // No receiver: exercise the actual registered callback.
      return doc ? { status: 'document', text: doc.querySelector('main')?.textContent ?? null, url: doc.URL }
        : { status: 'null' };
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
  await page.waitForFunction(() => window._si.some(command => command[0] === 'input'));
  expect(await page.evaluate(() => window._si.find(command => command[0] === 'input').slice(0, 3)))
    .toEqual(['input', `${delivery}/da/pages/42_7`, 'fixture-token']);
  expect(await page.evaluate(() => window.requests.find(request => request.url === '/api/pageUrl').options.query))
    .toEqual({ contentId: '42_7', locale: 'da' });
  expect(await capture(page)).toMatchObject({ text: 'FIRST DRAFT', url: `${cms}/preview?id=42&language=en` });
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

test('missing preview iframe currently returns null', { tag: '@observation' }, async ({ page }) => {
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
    expect(result).toEqual({ status: 'throws', name: 'SecurityError' });
  });
}

for (const event of ['/epi/shell/context/changed', 'epi/shell/context/request']) {
  test(`context: Page to Block to Page avoids Block URL requests through ${event}`, async ({ page }) => {
    const { cms, delivery } = await setup(page);
    const result = await page.evaluate(async event => {
      const handler = window.subscriptions[event];
      const flush = () => new Promise(resolve => setTimeout(resolve, 0));
      const pageContext = (id, language) => ({ id, language, capabilities: { isPage: true } });
      const requests = () => window.requests.filter(request => request.url === '/api/pageUrl').map(request => request.options.query.contentId);
      await handler(pageContext('42_7', 'en'));
      await flush();
      const beforeBlock = window._si.filter(command => command[0] === 'input').length;
      await handler({ id: 'block-99', language: 'en', capabilities: { isPage: false } });
      await flush();
      const afterBlock = window._si.filter(command => command[0] === 'input').length;
      await handler(pageContext('43_9', 'da'));
      await flush();
      return {
        ids: requests(), beforeBlock, afterBlock,
        inputs: window._si.filter(command => command[0] === 'input').map(command => command.slice(0, 3)),
        queries: window.requests.filter(request => request.url === '/api/pageUrl').map(request => request.options.query),
      };
    }, event);
    expect(result).toEqual({
      ids: ['42_7', '43_9'], beforeBlock: 1, afterBlock: 1,
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
  });
}

test('context: absent or incomplete context is ignored without throwing or requesting a URL', async ({ page }) => {
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
  expect(result).toEqual({ errors: [], urlRequests: 0 });
});

test('starting on a Block still allows the first Page to initialize once', async ({ page }) => {
  const { delivery } = await setup(page, { initialContext: { id: 'block-99', capabilities: { isPage: false } } });
  expect(await page.evaluate(() => window.requests.filter(request => request.url === '/api/pageUrl'))).toEqual([]);
  await page.evaluate(() => {
    const context = { id: '42_7', language: 'da', capabilities: { isPage: true } };
    window.subscriptions['/epi/shell/context/current'](context);
    window.subscriptions['/epi/shell/context/current'](context);
  });
  await expect.poll(() => page.evaluate(() => window._si.filter(command => command[0] === 'input').map(command => command.slice(0, 3))))
    .toEqual([['input', `${delivery}/da/pages/42_7`, 'fixture-token']]);
  expect(await page.evaluate(() => window.requests.filter(request => request.url === '/api/pageUrl').length)).toBe(1);
});

test('a failed page URL lookup resets the page context and the next Page succeeds', async ({ page }) => {
  const { delivery } = await setup(page, { failedContentId: '42_7' });
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
