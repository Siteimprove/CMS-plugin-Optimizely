import { expect } from '@playwright/test';
import { imageAlternativeRule } from './accessibility-rule.mjs';

const category = overlay => overlay.getByRole('button', { name: /^Accessibility\b/i })
  .or(overlay.getByRole('tab', { name: /^Accessibility\b/i }))
  .or(overlay.getByText('Accessibility', { exact: true })).filter({ visible: true }).first();

export async function openAccessibilityResults(overlay) {
  const issue = overlay.getByText(imageAlternativeRule.label, { exact: true }).filter({ visible: true });
  if (await issue.count()) return;
  const control = category(overlay);
  await expect(control).toBeVisible();
  if (await control.getAttribute('aria-expanded') !== 'true'
    && await control.getAttribute('aria-selected') !== 'true') await control.click();
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
