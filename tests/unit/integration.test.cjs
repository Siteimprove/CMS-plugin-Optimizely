const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('SiteImprove.Optimizely.Plugin/modules/_protected/SiteImprove.Optimizely.Plugin_files/1.0.5/ClientResources/Scripts/siteimprove.js', 'utf8');

function harness() {
  let module;
  let preview = { contentWindow: { document: { page: 'first' } } };
  const commands = [], calls = [], subscriptions = [];
  const request = { get: (path, options) => {
    calls.push({ path, options });
    return Promise.resolve(path === 'token' ? 'synthetic-token' : { url: `http://localhost/${options?.query?.contentId}`, isDomain: false });
  } };
  const window = { _si: commands, epi: { routes: { getActionPath: x => x.action } } };
  vm.runInNewContext(source, {
    window,
    document: { querySelector: () => preview },
    define: (_, factory) => { module = factory({}, (_, body) => body, {}, {},
      { subscribe: (...args) => subscriptions.push(args) }, request, {}, (promise, fn) => Promise.resolve(promise).then(fn)); }
  });
  return { module, commands, calls, subscriptions, window, setPreview: p => { preview = p; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('initial page context is sent once and ignores non-page content', async () => {
  const h = harness();
  h.module.contextCurrent({ id: 'folder' });
  h.module.contextCurrent({ id: '10', language: 'en', capabilities: { isPage: true } });
  h.module.contextCurrent({ id: '10', language: 'en', capabilities: { isPage: true } });
  await flush();
  assert.equal(h.commands.length, 1);
  assert.deepEqual(Array.from(h.commands[0]).slice(0, 3), ['input', 'http://localhost/10', 'synthetic-token']);
  assert.equal(h.calls[0].options.query.locale, 'en');
});

test('navigation resolves the new page and passes its URL', async () => {
  const h = harness();
  h.module.contextChange({ id: '11', language: 'en', capabilities: { isPage: true } });
  await flush();
  assert.equal(h.commands[0][1], 'http://localhost/11');
});

test('prepublish callback resolves the current iframe document on each call', async () => {
  const h = harness();
  h.module.inherited = () => {};
  h.module.initialize();
  await flush();
  const callback = h.commands.find(c => c[0] === 'registerPrepublishCallback')[1];
  assert.equal(callback().page, 'first');
  h.setPreview({ contentWindow: { document: { page: 'second' } } });
  assert.equal(callback().page, 'second');
  h.setPreview(null);
  assert.equal(callback(), null);
});

test('highlight callback uses the current preview DOM', async () => {
  const h = harness();
  h.module.inherited = () => {};
  h.module.initialize();
  await flush();
  h.setPreview({ contentWindow: { document: { page: 'second' } } });
  h.commands.find(c => c[0] === 'onHighlight')[1]({ selector: 'h1' });
  assert.equal(h.commands.at(-1)[0], 'applyDefaultHighlighting');
  assert.equal(h.commands.at(-1)[2].page, 'second');
});


test('a token response uses the overlay queue installed while the request was pending', async () => {
  const h = harness();
  h.module.pushSi('input', 'https://example.invalid/current');
  const received = [];
  h.window._si = { push: command => received.push(command) };
  await flush();
  assert.equal(received.length, 1);
  assert.equal(received[0][1], 'https://example.invalid/current');
  assert.equal(h.commands.length, 0);
});

test('queued highlight callback uses the loaded overlay handler', async () => {
  const h = harness();
  h.module.inherited = () => {};
  h.module.initialize();
  await flush();
  const received = [];
  h.window._si = { push: command => received.push(command) };
  h.commands.find(command => command[0] === 'onHighlight')[1]({ selector: 'h1' });
  assert.equal(received[0][0], 'applyDefaultHighlighting');
});
