const { test, expect } = require('@playwright/test');

async function fixture(page, expanded, issue) {
  await page.setContent(`<button aria-expanded="${expanded}" onclick="const open=this.getAttribute('aria-expanded')==='true';this.setAttribute('aria-expanded',!open);document.querySelector('section').hidden=open">Accessibility</button>
    <section ${expanded ? '' : 'hidden'}>${issue ? '<p>Image without a text alternative</p>' : '<p>No accessibility issues</p>'}</section>
    <button>Recheck draft</button>`);
}

test('opens collapsed accessibility results to expose the documented issue', async ({ page }) => {
  const { openAccessibilityResults, resultViewState } = await import('../live/result-view.mjs');
  await fixture(page, false, true);
  await openAccessibilityResults(page);
  expect(await resultViewState(page)).toMatchObject({ imageIssuePresent: true, imageIssueVisible: true, resultRecheckVisible: true });
});

test('keeps expanded corrected results open and does not manufacture an issue', async ({ page }) => {
  const { openAccessibilityResults, resultViewState } = await import('../live/result-view.mjs');
  await fixture(page, true, false);
  await openAccessibilityResults(page);
  await expect(page.locator('section')).toBeVisible();
  expect(await resultViewState(page)).toMatchObject({ imageIssuePresent: false, imageIssueVisible: false, resultAlertVisible: false });
});
