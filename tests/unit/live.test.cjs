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

test('report readiness matches the requested page without treating mainUrl as its identity', async () => {
  const { isReport } = await import('../live/settings.mjs');
  const expected = fixture().SITEIMPROVE_CRAWLED_URL;
  const body = { authed: true, error: 'None', issues: 0, mainUrl: 'https://my2.siteimprove.com/report' };
  assert.equal(isReport(body, expected, expected), true);
  for (const patch of [{ authed: false }, { error: 'Failed' }, { issues: -1 },
    { issues: '0' }, { mainUrl: '' }, { mainUrl: null }, { mainUrl: '   ' }]) {
    assert.equal(isReport({ ...body, ...patch }, expected, expected), false);
  }
  for (const requested of [null, 'https://other.example.test/', expected + '?preview=1'])
    assert.equal(isReport(body, requested, expected), false);
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
    const result = { status: 'failed', duration: 1,
      annotations: [{ type: 'live-diagnostics', description: JSON.stringify({ entitlementStatus: 429,
        panelVisible: false, pollStatus: 'private-value', url: 'private-value', token: 'private-value' }) },
        { type: 'live-diagnostics', description: JSON.stringify({ imageIssuePresent: true, imageIssueVisible: false, privateText: 'private-value' }) }],
      error: { message: 'private-value' }, attachments: [{ body: 'private-value' }] };
    reporter.onStepBegin({}, result, { category: 'test.step', title: 'live: CMS login' });
    reporter.onStepBegin({}, result, { category: 'test.step', title: 'private-value' });
    reporter.onStepBegin({}, result, { category: 'pw:api', title: 'private-value' });
    reporter.onTestEnd({ title: 'fixed smoke test' }, result);
    reporter.onEnd({ status: 'failed' });
    const output = fs.readFileSync('artifacts/live/result.json', 'utf8');
    assert.equal(output.includes('private-value'), false);
    assert.equal(JSON.parse(output).tests[0].status, 'failed');
    assert.equal(JSON.parse(output).tests[0].lastStage, 'live: CMS login');
    assert.deepEqual(JSON.parse(output).tests[0].diagnostics, { panelVisible: false, entitlementStatus: 429, imageIssuePresent: true, imageIssueVisible: false });
  } finally { process.chdir(cwd); fs.rmSync(temp, { recursive: true, force: true }); }
});

test('live configuration needs only the six shared secrets', async () => {
  const { settings } = await import('../live/settings.mjs');
  assert.equal(settings(fixture()).cmsOrigin, 'http://localhost:5000');
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

test('live diagnostics accept only known booleans and HTTP status codes', async () => {
  const { safeDiagnostics } = await import('../live/diagnostics.mjs');
  assert.deepEqual(safeDiagnostics({ pollStatus: 200, pollAuthenticated: true, body: 'private-value' }),
    { pollAuthenticated: true, pollStatus: 200 });
  assert.deepEqual(safeDiagnostics({ pollStatus: 123456, entitlementStatus: 0, pollAuthenticated: 'private-value' }), {});
});

test('SDK asset diagnostics exclude account routes, origins, credentials and query strings', async () => {
  const { publicSdkAsset, safeDiagnostics } = await import('../live/diagnostics.mjs');
  const asset = 'https://contentassistant.eu.siteimprove.com/assets/index-abcd1234.js';
  assert.equal(publicSdkAsset(asset + '?token=private-value'), asset);
  for (const value of ['https://attacker.example/assets/index.js',
    'https://user:private-value@contentassistant.eu.siteimprove.com/assets/index.js',
    'https://contentassistant.eu.siteimprove.com/cms/private-value.js',
    'https://contentassistant.eu.siteimprove.com/assets/private-value.js',
    asset + '#private-value', 'not-a-url']) assert.equal(publicSdkAsset(value), null);
  const result = safeDiagnostics({ sdkAssets: [asset, asset + '?token=private-value', 'private-value'], url: 'private-value' });
  assert.deepEqual(result, { sdkAssets: [asset] });
  assert.equal(JSON.stringify(result).includes('private-value'), false);
});
