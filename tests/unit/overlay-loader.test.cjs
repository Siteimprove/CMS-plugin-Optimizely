const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('SiteImprove.Optimizely.Plugin/modules/_protected/SiteImprove.Optimizely.Plugin_files/1.0.5/ClientResources/Scripts/overlay-loader.js', 'utf8');

for (const version of ['v1', 'latest', 'unexpected']) {
  test(`overlay ${version} loads asynchronously once and preserves pending commands`, () => {
    const pending = [['input', 'https://example.invalid/']];
    const scripts = [];
    const context = vm.createContext({ URL, window: { _si: pending }, document: {
      currentScript: { src: `http://localhost/custom/overlay-loader.js?version=${version}` },
      getElementById: id => scripts.find(script => script.id === id),
      createElement: () => ({}),
      head: { appendChild: script => scripts.push(script) },
    } });
    vm.runInContext(source, context);
    vm.runInContext(source, context);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].async, true);
    assert.equal(scripts[0].src, `https://cdn.siteimprove.net/cms/overlay-${version === 'latest' ? 'latest' : 'v1'}.js`);
    assert.equal(context.window._si, pending);
    assert.equal(pending.length, 1);
  });
}
