const flags = ['entitlementReady', 'pollSeen', 'pollOk', 'pollAuthenticated', 'pollUrlMatches',
  'pollMainUrlPresent', 'pollIssueCountValid', 'pollErrorNone', 'panelFramePresent', 'panelVisible', 'launcherVisible',
  'blockedExternalRequest', 'accessibilityCategoryVisible', 'imageIssuePresent', 'imageIssueVisible',
  'resultAlertVisible', 'resultHasNestedFrame', 'resultRunning', 'resultRecheckVisible'];

// Account text and arbitrary response fields must never enter public artifacts.
export function safeDiagnostics(value) {
  const result = {};
  for (const key of flags) if (typeof value?.[key] === 'boolean') result[key] = value[key];
  for (const key of ['entitlementStatus', 'pollStatus'])
    if (Number.isInteger(value?.[key]) && value[key] >= 100 && value[key] <= 599) result[key] = value[key];
  return result;
}
