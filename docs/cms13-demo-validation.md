# CMS 13 demo validation — 27 October 2026

Candidate: `5.0.0-alpha.13` (experimental; not an external beta release).
Package SHA256: `ad28d359a2861411618120966493e23abea7082005e14b7329f12a8098435cb9`.

## Environments

- Windows demo: CMS 13.0.2, .NET SDK 10.0.403, ASP.NET Core Hosting Bundle 10.0.14, IIS and SQL Server Express. Browser testing uses Edge within the existing Windows App session.
- Private Mac acceptance host: CMS 13.0.0 with the same alpha.13 package. Its HTTP fixtures use disposable accounts.

## Completed checks

- 35 C# checks, 60 JavaScript/Chromium checks, 53 HTTP acceptance checks: 148 passing checks on the candidate.
- Package resource/version inspection and isolated consumer restore/publish passed.
- Windows update verified the package checksum, retained the CMS 13 database configuration and existing deployment settings, made a protected file backup and passed its homepage startup check. No rollback was needed.
- Refreshed editor and authenticated Siteimprove panel loaded. Live page displayed the existing report. A fresh Start page draft check completed with 8 accessibility, 1 content, 0 policy and 13 SEO issue types.
- Selecting a shared Editorial block cleared the page report and removed Live page / Unpublish risks, leaving the prepublish workflow.
- Corner notifications were absent while switching contexts and running the fresh page check. Cancelling the later Editorial block check showed the SDK's confirmation inside the plugin panel.

## Host defect found and fixed

The Alloy block preview still used `Html.DisplayFor` for its content areas. Under CMS 13 this rendered the display-size headings but omitted the saved block body. The preview now uses `epi-property`, `epi-template-tag` and `epi-property-item`, with Alloy's existing item rendering callback. This follows [CMS 13's template rendering contract](https://docs.developers.optimizely.com/content-management-system/v13.0.0-CMS/docs/select-templates).

The host built successfully with the corrected Razor template. Its deployment retained alpha.13, backed up the prior deployment and passed startup. After signing in again, the saved Editorial image appeared in the Full and Wide previews. The earlier empty-preview scan is not evidence that its authored image was checked. A subsequent standard Editorial scan was cancelled after remaining in progress; its before/after issue assertions were not counted.

## Exact CMS 12 block case

A demo-only block model and standalone preview reproduce the CMS 12 test's fields and conditional image markup. They are host test fixtures, excluded from the plugin package. The image omits `alt` when the alternative is empty and renders it when supplied. A published baseline and a distinct unpublished draft are used to distinguish draft capture from published content.

The published baseline of shared block 114 was saved without the image and reloaded: its preview contained `published baseline` / `cms13 baseline`, with no blue square. A new unpublished draft changed these values to `draft image check` / `cms13 draft before` and enabled the image while leaving its alternative empty. Reloading confirmed the values and image persisted; the Publish action remained available.

The real Siteimprove scan from All Properties completed with 2 accessibility issue types. Level A contained exactly one **Image missing a text alternative** finding; Level AAA contained one further finding. No page tabs or corner notification appeared. Returning to Visual Builder retained the result. An old hidden-preview result was not used to claim a visible highlight; that requires a fresh check of the visible document.

The draft alternative was changed to `blue square illustrating the block test symbol` and the marker to `cms13 draft after`. CMS showed Autosaved. Reloading the editor confirmed both persisted and the preview displayed the new marker. The correction was not published. The after-fix recheck completed with Recheck draft enabled and no active-check indicator or error alert. Accessibility issue types fell from 2 to 1. Opening Accessibility showed Level AAA (1) and best practices (0); Level A and the missing-image-alternative issue were absent. This matches the CMS 12 missing-alt scan → persisted draft correction → recheck case. The original baseline was the only test publication; neither the image-bearing draft nor the correction was published. A separate visible-preview scan attempt returned the SDK message that the check could not start; this is recorded as a failed attempt, not a passing highlight test.

## Limits

Opti ID / Graph, real subscription-denial and outage recovery, other browsers and the complete release compatibility matrix are not established by these demo checks. Known platform dependency advisories and exact-candidate hosted CI/release review remain beta gates; see [beta readiness](cms13-beta-readiness.md). Raw screenshots and private installation records remain local.

## Follow-up findings

- A scan attempted after changing from All Properties to Visual Builder returned an SDK error that the check could not start. The same block's subsequent All Properties check completed and cleared the corrected issue. The failed visible-preview path and real highlighting require a clean retry and diagnosis; do not count them as passed.
- Browser diagnostics reported blocked CMS WebSocket traffic to the same demo origin and blocked font loads under the inherited host Content Security Policy. A public header-only check confirmed the current policy omits an explicit secure WebSocket allowance. This is evidence of a host configuration problem, not proof that it caused the SDK scan failure. No policy was weakened or changed during this checkpoint.
- The remote desktop connection dropped during that investigation. Reconnecting stopped at an unverified RDP certificate prompt. Remaining VM checks need the user's trust decision at that prompt.
- A separate HTTPS homepage check from the Mac returned 200 after all three deployments.

Local evidence is retained under `vm-cms13-upgrade/evidence/block-parity/` outside the plugin repository. It includes the image-free published baseline, persisted image-bearing draft, Level A missing-alt result, persisted correction and the cleared Level A result. The file named `highlight-attempt-unconfirmed.jpg` records an attempted highlight; it does not show a confirmed highlight and is not passing evidence.
