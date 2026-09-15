const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../SiteImprove.Optimizely.Plugin/modules/_protected/SiteImprove.Optimizely.Plugin_files/5.0.0/ClientResources/Scripts/siteimprove.js'), 'utf8');
function load(frame = null) {
    let module;
    const window = { _si: [], epi: { routes: { getActionPath: x => x.action } } };
    const requests = [];
    const request = { get: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })) };
    vm.runInNewContext(source, {
        window, document: { querySelector: () => frame },
        define: (deps, factory) => { module = factory({}, (_, obj) => obj, {}, {}, {}, request, {}, {}); }
    });
    return { module, window, requests };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('cross-origin preview returns unavailable without throwing or capturing CMS HTML', () => {
    const frame = { get contentWindow() { const e = new Error('cross origin'); e.name = 'SecurityError'; throw e; } };
    assert.equal(load(frame).module.getPreviewDom(), null);
});
test('missing, blank and loading previews are not checkable', () => {
    assert.equal(load().module.getPreviewDom(), null);
    for (const doc of [{readyState:'loading', body:{}, URL:'https://preview/'}, {readyState:'complete', body:{}, URL:'about:blank'}]) {
        assert.equal(load({contentWindow:{document:doc}}).module.getPreviewDom(), null);
    }
});
test('preview document is resolved again after navigation', () => {
    const first = {readyState:'complete', body:{}, URL:'https://preview/one'};
    const second = {readyState:'complete', body:{}, URL:'https://preview/two'};
    const frame = {contentWindow:{document:first}};
    const { module } = load(frame);
    assert.equal(module.getPreviewDom(), first);
    frame.contentWindow.document = second;
    assert.equal(module.getPreviewDom(), second);
});
test('late page URL responses cannot replace the current page', async () => {
    const { module, requests, window } = load();
    module.contextChange({id:'1', language:'en'});
    module.contextChange({id:'2', language:'en'});
    requests[1].resolve({url:'https://public/two'});
    await tick();
    requests[2].resolve('token');
    await tick();
    requests[0].resolve({url:'https://public/one'});
    await tick();
    assert.equal(window._si.length, 1);
    assert.equal(window._si[0][1], 'https://public/two');
});
test('late token responses cannot restore a page after navigating to a block', async () => {
    const { module, requests, window } = load();
    module.contextChange({id:'1', language:'en'});
    requests[0].resolve({url:'https://public/one'});
    await tick();
    module.contextChange({id:'block', capabilities:{isPage:false}});
    requests[1].resolve('old-token');
    requests[2].resolve('token');
    await tick();
    assert.equal(window._si.length, 1);
    assert.equal(window._si[0][1], '');
});
