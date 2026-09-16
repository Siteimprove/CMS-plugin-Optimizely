import { expect } from '@playwright/test';
import { imageAlternativeRule } from './accessibility-rule.mjs';

const category = overlay => overlay.getByRole('button', { name: /^Accessibility\b/i })
  .or(overlay.getByRole('tab', { name: /^Accessibility\b/i }))
  .or(overlay.getByText('Accessibility', { exact: true })).filter({ visible: true }).first();

const levelA = overlay => overlay.getByRole('button', { name: /^Level A(?:\s|$)/ })
  .or(overlay.getByRole('tab', { name: /^Level A(?:\s|$)/ }))
  .or(overlay.getByText('Level A', { exact: true })).filter({ visible: true }).first();

export async function openAccessibilityResults(overlay, { levelRequired = true } = {}) {
  const issue = overlay.getByText(imageAlternativeRule.label, { exact: true }).filter({ visible: true });
  if (await issue.count()) return;
  if (!await levelA(overlay).isVisible()) {
    const control = category(overlay);
    await expect(control).toBeVisible();
    if (await control.getAttribute('aria-expanded') !== 'true'
      && await control.getAttribute('aria-selected') !== 'true') await control.click();
  }
  const level = levelA(overlay);
  if (!levelRequired && !await level.isVisible()) return;
  await expect(level).toBeVisible();
  if (await level.getAttribute('aria-expanded') !== 'true'
    && await level.getAttribute('aria-selected') !== 'true') await level.click();
}

export async function openPrepublishOverview(overlay) {
  await overlay.getByRole('tab', { name: /Prepublish/i })
    .or(overlay.getByText('Prepublish view', { exact: true })).first().click({ timeout: 30_000 });
  // The SDK hides scan controls while a topic is selected. Its back action resets the overview.
  const back = overlay.locator('[data-observe-key="navigation-button-back"]').filter({ visible: true });
  if (await back.count()) await back.click({ timeout: 30_000 });
  await expect(overlay.getByRole('button', { name: /^(Run content check|Recheck draft)$/i }))
    .toBeVisible();
}

export async function resultViewState(overlay) {
  const issue = overlay.getByText(imageAlternativeRule.label, { exact: true });
  return {
    prepublishViewSelected: await overlay.getByRole('tab', { name: /Prepublish/i, selected: true }).count() > 0,
    livePageViewSelected: await overlay.getByRole('tab', { name: /Live page/i, selected: true }).count() > 0,
    accessibilityCategoryVisible: await category(overlay).isVisible(),
    imageIssuePresent: await issue.count() > 0,
    imageIssueVisible: await issue.filter({ visible: true }).count() > 0,
    resultAlertVisible: await overlay.getByRole('alert').filter({ visible: true }).count() > 0,
    resultHasNestedFrame: await overlay.locator('iframe').count() > 0,
    resultRunning: await overlay.getByRole('button', { name: /Cancel content check/i }).isVisible(),
    resultRecheckVisible: await overlay.getByRole('button', { name: /^Recheck draft$/i }).isVisible(),
  };
}
