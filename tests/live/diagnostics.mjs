const flags = ['entitlementReady', 'pollSeen', 'pollOk', 'pollAuthenticated', 'pollUrlMatches',
  'pollMainUrlPresent', 'pollIssueCountValid', 'pollErrorNone', 'panelFramePresent', 'panelVisible', 'launcherVisible',
  'blockedExternalRequest', 'accessibilityCategoryVisible', 'imageIssuePresent', 'imageIssueVisible',
  'resultAlertVisible', 'resultHasNestedFrame', 'resultRunning', 'resultRecheckVisible',
  'prepublishViewSelected', 'livePageViewSelected', 'firstDraftImagePresent',
  'fixedDraftImagePresent', 'fixedDraftAlternativePresent'];

// Only static SDK bundles; never application routes or query strings.
export function publicSdkAsset(value) {
  try {
    const url = new URL(value);
    if (!/^https:\/\/(?:contentassistant\.[a-z]+\.siteimprove\.com|cdn\.siteimprove\.net)$/.test(url.origin)
      || url.username || url.password || url.hash) return null;
    if (!/^\/(?:assets|js|scripts|dist|static|bundles|build|content|cms)\/(?:[a-z0-9_-]+\/){0,4}(?:app|main|index|runtime|vendor|vendors|cms|sdk|site|bundle|contentassistant)(?:[.-][a-z0-9_-]+)*\.js$/i.test(url.pathname)) return null;
    return url.origin + url.pathname;
  } catch { return null; }
}

// Account text and arbitrary response fields must never enter public artifacts.
export function safeDiagnostics(value) {
  const result = {};
  for (const key of flags) if (typeof value?.[key] === 'boolean') result[key] = value[key];
  for (const key of ['entitlementStatus', 'pollStatus'])
    if (Number.isInteger(value?.[key]) && value[key] >= 100 && value[key] <= 599) result[key] = value[key];
  if (Array.isArray(value?.sdkAssets)) {
    const assets = value.sdkAssets.filter(item => typeof item === 'string').map(publicSdkAsset).filter(Boolean);
    result.sdkAssets = [...new Set(assets)].sort().slice(0, 32);
  }
  return result;
}
