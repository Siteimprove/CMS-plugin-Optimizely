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


for (const detailed of [true, false]) {
  test(`scan controls are reachable from ${detailed ? 'issue details' : 'the overview'}`, async ({ page }) => {
    const { openPrepublishOverview } = await import('../live/result-view.mjs');
    await page.setContent(`
      <button role="tab" aria-selected="true">Prepublish</button>
      <button data-observe-key="navigation-button-back" ${detailed ? '' : 'hidden'}
        onclick="this.hidden=true;document.querySelector('#scan').hidden=false">Back</button>
      <section>Accessibility → Level A</section>
      <button id="scan" ${detailed ? 'hidden' : ''}>Recheck draft</button>`);
    await openPrepublishOverview(page);
    await expect(page.getByRole('button', { name: 'Recheck draft' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  });
}


test('completed clean results can omit the Level A group', async ({ page }) => {
  const { openAccessibilityResults } = await import('../live/result-view.mjs');
  await page.setContent(`<button onclick="document.querySelector('section').hidden=false" aria-expanded="false">Accessibility</button>
    <section hidden>No accessibility issues</section>`);
  await openAccessibilityResults(page, { levelRequired: false });
  await expect(page.locator('section')).toBeVisible();
  await expect(page.getByText('Image missing a text alternative', { exact: true })).toHaveCount(0);
});
