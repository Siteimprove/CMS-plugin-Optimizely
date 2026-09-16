const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const report = issue => ({ checkInProgress: null, data: {
  topics: [{ title: 'Accessibility' }], categories: issue ? [{ title: 'Level A' }] : [],
  elements: issue ? [{ content: { title: 'Image missing a text alternative' } }] : [],
} });

test('scan summaries distinguish complete clean results from missing, running, and malformed results', async () => {
  const { summarizeResult } = await import('../live/scan-results.mjs');
  assert.deepEqual(summarizeResult(report(true)), { issuePresent: true, levelAPresent: true });
  assert.deepEqual(summarizeResult(report(false)), { issuePresent: false, levelAPresent: false });
  for (const value of [null, {}, { ...report(false), checkInProgress: {} },
    { data: { topics: [], categories: [], elements: [] } },
    { data: { ...report(false).data, elements: [{}] } }]) assert.equal(summarizeResult(value), null);
});

test('scan observer requires a matching accepted upload and a subsequent result request', async () => {
  const { observeScanResults } = await import('../live/scan-results.mjs');
  const page = new EventEmitter();
  const url = 'https://public.example/page/';
  const observer = observeScanResults(page, url);
  const request = (path, body = '', origin = 'https://contentassistant.eu.siteimprove.com') => ({
    url: () => `${origin}${path}?url=${encodeURIComponent(url)}`, method: () => body ? 'POST' : 'GET', postData: () => body,
  });
  const respond = async (req, value) => {
    page.emit('response', { request: () => req, status: () => 200, json: async () => value });
    await new Promise(resolve => setImmediate(resolve));
  };
  const first = observer.begin('draft-one');
  const stale = request('/PrepublishCheck/Results'); page.emit('request', stale);
  const wrong = request('/PrepublishCheck/Upload', 'draft-other'); page.emit('request', wrong);
  await respond(wrong, { success: true }); assert.equal(first.accepted, false);
  const upload = request('/PrepublishCheck/Upload', 'draft-one'); page.emit('request', upload);
  await respond(upload, { success: true }); assert.equal(first.accepted, true);
  await respond(stale, report(false)); assert.equal(first.result, null);
  const fresh = request('/PrepublishCheck/Results'); page.emit('request', fresh);
  await respond(fresh, report(true)); assert.equal(first.result.issuePresent, true);
  const fixed = observer.begin('draft-two');
  await respond(fresh, report(false)); assert.equal(fixed.result, null);
  const rejected = request('/PrepublishCheck/Upload', 'draft-two'); page.emit('request', rejected);
  await respond(rejected, { success: false }); assert.equal(fixed.accepted, false);
  const fixedUpload = request('/PrepublishCheck/Upload', 'draft-two'); page.emit('request', fixedUpload);
  await respond(fixedUpload, { success: true });
  const fixedResults = request('/PrepublishCheck/Results'); page.emit('request', fixedResults);
  await respond(fixedResults, report(false)); assert.deepEqual(fixed.result, { issuePresent: false, levelAPresent: false });
});
