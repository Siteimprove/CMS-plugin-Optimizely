# Shared block prepublish beta

Editors can check a shared block's current draft before submitting it for review or approval. On a block, the plugin clears the published-page context and offers Prepublish against a fragment. Returning to a page restores its normal URL-based context. Publishing and approval behavior are unchanged.

## Requirements

- Enable Latest UI in the plugin settings; the legacy overlay does not receive block scans.
- The Siteimprove account must have Prepublish access.
- The site must supply a block preview template with its real markup and relevant styles. The CMS context must provide `editablePreviewUrl` or `editablePreviewUrlWithToken` on the CMS origin. The plugin does not create templates for customer block types.

The callback uses a matching, fully loaded `sitePreview` document when available. Otherwise it renders the CMS-provided draft URL in a temporary viewport-sized iframe, including from All Properties view. It removes that iframe after capture, on context change, on inaccessible/redirected previews, or after a ten-second loading timeout. It never falls back to the CMS editor document or a containing page. Temporary previews are for capture; highlighting is available only in a matching visible preview.

The integration uses the SDK's `clear` command and returns `[document, cleanup, 'fragment']` from the Prepublish callback. It initializes the latest SDK session before other commands. The public `PageUrl` endpoint and publication rechecks remain page-specific. Context revisions prevent late page URL/token responses from overwriting a newer selection.

## Scope

Shared blocks with an editable HTML preview are supported. Media, inline block properties, cross-origin/headless previews without a bridge, and blocks without a preview template are outside this beta. Fragment checks do not replace checking the block in each containing page's layout. Missing or cross-origin preview URLs remove the scan callback; failed preview rendering cannot produce a valid capture.

## Validation

Local checks passed: 20 Node unit tests and 58 functional browser checks across Chromium and Firefox. These execute the production module with controlled CMS services and SDK commands. They cover direct block editing, page/block switching, draft revisions/languages, cleanup, inaccessible previews, cancelled captures and late responses.

The packaged CMS suite passed all seven scenarios on CMS UI 12.34.6 / core 12.24.0. It installed a fresh working-tree candidate built with the pinned SDK 8.0.425, verified the installed DLL/module ZIP against the package, and used a fresh SQL Server 2022 database. SQL Server ran through Rosetta on the local ARM64 Mac; this run does not replace the x64 Linux release checks. The same package also passed all seven scenarios on CMS UI 12.32.5 / core 12.22.6: 14 integration scenarios passed across both locked profiles.

Live UI verification used the same installed candidate in the user's signed-in Chrome profile with the real CDN SDK and real Siteimprove Content Assistant. The local CMS helper responses remained controlled; no live API credentials were needed. A local-only URL mapping connected First page to the existing public demo report, with automatic rechecks disabled.

Opening the shared block through the CMS assets pane removed Live page and Unpublish risks and showed only the Prepublish content-check screen. The All Properties view showed the synthetic draft text. The initial UI-switching check started a real fragment scan. A subsequent before-and-after block test verified completed scans and results, described below. Selecting First page through the CMS page tree restored Live page, Prepublish view and Unpublish risks, including the existing page report. Screenshots are retained locally in `artifacts/evidence/live-ui/`.

## Completed real block scans

On October 13, 2026, a fresh candidate installed into CMS UI 12.34.6 / core 12.24.0 passed eight CMS fixture scenarios. The additional fixture creates a published block without a test image, then an unpublished draft containing an image with no `alt` attribute and a unique marker. The published preview was checked independently and contained neither the draft marker nor the test image.

In signed-in Chrome, the real Siteimprove SDK scanned that shared block through the production Prepublish callback. The first scan finished and displayed **Image missing a text alternative** once under **Level A**. Its result overview contained two accessibility issues.

The image alternative was filled in the CMS editor with `Blue square illustrating the block test symbol`; the draft marker was also changed. The CMS showed Autosaved, and reloading the editor confirmed both values persisted. No publishing action was taken.

A fresh second scan finished with Recheck draft enabled, Cancel content check absent and no visible error alert. The target issue was absent from the loaded Accessibility results, the Level A group disappeared, and the total accessibility issue count fell from two to one. The remaining issue is Level AAA. The temporary capture iframe count returned to zero after both scans.

Before-and-after screenshots and the candidate checksum are retained locally under `artifacts/evidence/live-block-scan/`. These checks used the real CDN overlay and real Siteimprove results, with no browser response stubs or DOM changes to manufacture outcomes. The local CMS helper's token/settings HTTP responses remained controlled; the existing browser login supplied Siteimprove authentication.

The integration run exposed two setup defects that were corrected: the candidate builder now resolves macOS temporary-directory symlinks so Razor retains view paths, and the synthetic block grants its fixture editor access to unpublished versions. These changes affect build/test setup; customer content permissions are unchanged.

References: [Siteimprove SDK](https://developer.siteimprove.com/siteimprove-cms-plugin-markdown.html), [fragment callback guidance](https://help.siteimprove.com/support/solutions/articles/80001197343-how-to-upgrade-siteimprove-cms-plugin-to-sdk-v2), [Optimizely block previews](https://docs.developers.optimizely.com/content-management-system/docs/preview-rendering-for-blocks).
