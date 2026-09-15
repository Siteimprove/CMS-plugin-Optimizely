import { test } from '@playwright/test';
import { openLiveEditor } from './editor.mjs';

test('real overlay authenticates and returns the mapped existing report', async ({ page, context }) => {
  await openLiveEditor(page, context);
});
