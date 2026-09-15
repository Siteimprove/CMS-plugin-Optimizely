const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fixture = () => ({ SITEIMPROVE_USERNAME: 'test-user', SITEIMPROVE_PASSWORD: 'test-password',
  SITEIMPROVE_API_USERNAME: 'api-user', SITEIMPROVE_API_KEY: 'test-key',
  SITEIMPROVE_PUBLIC_URL: 'https://public.example.test/',
  SITEIMPROVE_CRAWLED_URL: 'https://public.example.test/products/example/' });

test('live URLs distinguish the public report from the disposable CMS', async () => {
  const { settings } = await import('../live/settings.mjs');
  const config = settings(fixture());
  assert.equal(config.cmsOrigin, 'http://localhost:5000');
  assert.equal(config.crawledUrl, fixture().SITEIMPROVE_CRAWLED_URL);
});

test('missing credentials and unsupported or mismatched public paths fail closed', async () => {
  const { settings } = await import('../live/settings.mjs');
  for (const key of Object.keys(fixture())) {
    assert.throws(() => settings({ ...fixture(), [key]: '' }), /MISSING_/);
  }
  for (const url of ['http://localhost:5000/', 'https://other.example.test/',
    'https://user:password@public.example.test/', 'https://public.example.test/a?token=private',
    'https://public.example.test/a#fragment', 'https://public.example.test/page.aspx',
    'https://public.example.test/No-Trailing-Slash']) {
    assert.throws(() => settings({ ...fixture(), SITEIMPROVE_CRAWLED_URL: url }), /CONFIGURATION/);
  }
});

test('only authenticated successful data for the expected page proves report readiness', async () => {
  const { isReport } = await import('../live/settings.mjs');
  const expected = fixture().SITEIMPROVE_CRAWLED_URL;
  const body = { authed: true, error: 'None', issues: 0, mainUrl: expected };
  assert.equal(isReport(body, expected), true);
  for (const patch of [{ authed: false }, { error: 'Failed' }, { issues: -1 },
    { issues: '0' }, { mainUrl: 'https://other.example.test/' }]) {
    assert.equal(isReport({ ...body, ...patch }, expected), false);
  }
});

test('browser requests reject lookalike login domains and unrelated hosts', async () => {
  const { allowedRequest } = await import('../live/settings.mjs');
  assert.equal(allowedRequest('https://identity.siteimprove.com/login'), true);
  assert.equal(allowedRequest('https://cdn.siteimprove.net/cms/overlay-latest.js'), true);
  assert.equal(allowedRequest('http://localhost:5000/'), true);
  for (const url of ['https://siteimprove.com.attacker.test/', 'https://othersiteimprove.com/',
    'http://identity.siteimprove.com/', 'https://public.example.test/', 'http://localhost:5001/']) {
    assert.equal(allowedRequest(url), false);
  }
});

test('live reporting discards raw failures and attachments', async () => {
  const { default: Reporter } = await import('../live/safe-reporter.mjs');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'live-reporter-'));
  const cwd = process.cwd();
  try {
    process.chdir(temp);
    const reporter = new Reporter();
    reporter.onError(new Error('private-value'));
    reporter.onTestEnd({ title: 'fixed smoke test' }, { status: 'failed', duration: 1,
      error: { message: 'private-value' }, attachments: [{ body: 'private-value' }] });
    reporter.onEnd({ status: 'failed' });
    const output = fs.readFileSync('artifacts/live/result.json', 'utf8');
    assert.equal(output.includes('private-value'), false);
    assert.equal(JSON.parse(output).tests[0].status, 'failed');
  } finally { process.chdir(cwd); fs.rmSync(temp, { recursive: true, force: true }); }
});

test('prepublish requires explicit success and issue labels', async () => {
  const { prepublishSettings } = await import('../live/settings.mjs');
  assert.throws(() => prepublishSettings(fixture()), /MISSING_SITEIMPROVE_SCAN_SUCCESS_LABEL/);
  const configured = { ...fixture(), SITEIMPROVE_SCAN_SUCCESS_LABEL: 'Completed successfully',
    SITEIMPROVE_IMAGE_ISSUE_LABEL: 'Missing image alternative' };
  assert.equal(prepublishSettings(configured).imageIssueLabel, configured.SITEIMPROVE_IMAGE_ISSUE_LABEL);
});

test('draft evidence ignores messages outside the real SDK origin and tracks each marker separately', async () => {
  const { observeDraft } = await import('../live/prepublish.mjs');
  let receive;
  const context = {
    exposeBinding: async (_, callback) => { receive = callback; },
    addInitScript: async () => {},
  };
  const evidence = await observeDraft(context, 'http://localhost:5000', ['draft-one', 'draft-two']);
  receive({ frame: { url: () => 'https://unrelated.example.test/' } }, { marker: 'draft-one' });
  receive({ frame: { url: () => 'https://contentassistant.eu.siteimprove.com/' } }, { marker: 'unrelated' });
  assert.equal(evidence['draft-one'], 0);
  receive({ frame: { url: () => 'https://contentassistant.eu.siteimprove.com/' } }, { marker: 'draft-two' });
  assert.equal(evidence['draft-one'], 0);
  assert.equal(evidence['draft-two'], 1);
});
