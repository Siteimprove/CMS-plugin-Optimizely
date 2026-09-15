export function settings(env) {
  const names = ['SITEIMPROVE_USERNAME', 'SITEIMPROVE_PASSWORD', 'SITEIMPROVE_API_USERNAME',
    'SITEIMPROVE_API_KEY', 'SITEIMPROVE_PUBLIC_URL', 'SITEIMPROVE_CRAWLED_URL'];
  for (const name of names) if (!env[name]?.trim()) throw new Error(`MISSING_${name}`);
  let base, crawled;
  try {
    base = new URL(env.SITEIMPROVE_PUBLIC_URL);
    crawled = new URL(env.SITEIMPROVE_CRAWLED_URL);
  } catch { throw new Error('INVALID_PUBLIC_URL_CONFIGURATION'); }
  if ([base, crawled].some(url => url.protocol !== 'https:' || url.username || url.password
    || url.search || url.hash || url.hostname === 'localhost' || url.hostname.endsWith('.invalid'))
    || base.origin !== crawled.origin
    || !/^\/(?:[a-z0-9_-]+\/)*$/.test(crawled.pathname))
    throw new Error('UNSUPPORTED_PUBLIC_URL_CONFIGURATION');
  return { ...Object.fromEntries(names.map(name => [name, env[name]])), crawledUrl: crawled.href,
    cmsOrigin: 'http://localhost:5000' };
}

export function allowedRequest(value) {
  const url = new URL(value);
  return url.origin === 'http://localhost:5000' || (url.protocol === 'https:' && !url.port && !url.username && !url.password
    && ['siteimprove.com', 'siteimprove.net'].some(host => url.hostname === host || url.hostname.endsWith('.' + host)));
}

export function isReport(value, requestedUrl, expectedUrl) {
  return value?.authed === true && value.error === 'None' && Number.isFinite(value.issues)
    && value.issues >= 0 && requestedUrl === expectedUrl
    && typeof value.mainUrl === 'string' && value.mainUrl.trim().length > 0;
}
