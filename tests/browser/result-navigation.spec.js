const { test, expect } = require('@playwright/test');

async function fixture(page, expanded, issue, levelExpanded = false) {
  await page.setContent(`<button aria-expanded="${expanded}" onclick="const open=this.getAttribute('aria-expanded')==='true';this.setAttribute('aria-expanded',!open);document.querySelector('section').hidden=open">Accessibility</button>
    <section ${expanded ? '' : 'hidden'}>
      <button aria-expanded="${levelExpanded}" onclick="const open=this.getAttribute('aria-expanded')==='true';this.setAttribute('aria-expanded',!open);document.querySelector('#level-a').hidden=open">Level A</button>
      <button onclick="throw new Error('Level AA must not be selected')">Level AA</button>
      <div id="level-a" ${levelExpanded ? '' : 'hidden'}>${issue ? '<p>Image missing a text alternative</p>' : '<p>No accessibility issues</p>'}</div>
    </section>
    <button>Recheck draft</button>`);
}

test('opens Accessibility then Level A to expose the image alternative issue', async ({ page }) => {
  const { openAccessibilityResults, resultViewState } = await import('../live/result-view.mjs');
  await fixture(page, false, true);
  await openAccessibilityResults(page);
  expect(await resultViewState(page)).toMatchObject({ imageIssuePresent: true, imageIssueVisible: true, resultRecheckVisible: true });
});

test('keeps expanded corrected results open and does not manufacture an issue', async ({ page }) => {
  const { openAccessibilityResults, resultViewState } = await import('../live/result-view.mjs');
  await fixture(page, true, false, true);
  await openAccessibilityResults(page);
  await expect(page.locator('#level-a')).toBeVisible();
  expect(await resultViewState(page)).toMatchObject({ imageIssuePresent: false, imageIssueVisible: false, resultAlertVisible: false });
});

test('opens Level A when Accessibility is already open', async ({ page }) => {
  const { openAccessibilityResults } = await import('../live/result-view.mjs');
  await fixture(page, true, true);
  await openAccessibilityResults(page);
  await expect(page.locator('#level-a')).toBeVisible();
});
