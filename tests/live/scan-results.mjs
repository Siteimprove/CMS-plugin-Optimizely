import { imageAlternativeRule } from './accessibility-rule.mjs';

// Match the result structure rendered by the SDK. Never retain titles or report bodies.
export function summarizeResult(value) {
  const data = value?.data;
  if (value?.checkInProgress || !Array.isArray(data?.topics) || !Array.isArray(data?.categories)
    || !Array.isArray(data?.elements)
    || data.elements.some(element => typeof element?.content?.title !== 'string')) return null;
  if (!data.topics.some(topic => topic.title === 'Accessibility')) return null;
  return {
    issuePresent: data.elements.some(element => element.content.title === imageAlternativeRule.label),
    levelAPresent: data.categories.some(category => category.title === 'Level A'),
  };
}

export function observeScanResults(page, crawledUrl) {
  let active;
  const requests = new WeakMap();
  const endpoint = request => {
    try {
      const url = new URL(request.url());
      if (!/^https:\/\/contentassistant\.[a-z]+\.siteimprove\.com$/.test(url.origin)
        || url.searchParams.get('url') !== crawledUrl) return '';
      return url.pathname;
    } catch { return ''; }
  };
  page.on('request', request => {
    const path = endpoint(request);
    if (active && path === '/PrepublishCheck/Upload' && request.method() === 'POST'
      && request.postData()?.includes(active.marker)) requests.set(request, { scan: active, upload: true });
    if (active?.accepted && path === '/PrepublishCheck/Results') requests.set(request, { scan: active });
  });
  page.on('response', async response => {
    const match = requests.get(response.request());
    if (!match || response.status() !== 200) return;
    try {
      const value = await response.json();
      if (match.upload) match.scan.accepted = value?.success === true;
      else {
        const summary = summarizeResult(value);
        if (summary) match.scan.result = summary;
      }
    } catch { /* Missing or unreadable results cannot satisfy the assertion. */ }
  });
  return {
    begin(marker) { active = { marker, accepted: false, result: null }; return active; },
  };
}
