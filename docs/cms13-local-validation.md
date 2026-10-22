# CMS 13 local validation — 22 October 2026

This checkpoint uses the official Alloy template 2.0.1, CMS 13.0.0, .NET 10.0.12 and a SQL Server 2022 CU22 Developer database. CMS runs on macOS with the database in a local container. The preview is server-rendered on the CMS origin. Authentication uses the template's ASP.NET Identity setup and a real administrator account.

The installed candidate is `5.0.0-alpha.4`, based on commit `9f8f8d4` with the fixes below. The local installed assembly was compared with the NuGet package, and the package's protected-module ZIP contains the matching versioned resources. No package has been released by this test.

## Findings and fixes

1. Visual Builder leaves the classic `sitePreview` iframe hidden and renders its page in an unnamed iframe inside `.content-preview`. Alpha.2 missed that visible preview and incorrectly disabled checks. The candidate examines both CMS preview containers, rejects hidden or zero-sized frames and requires the selected page/language/version URL to match. A browser regression reproduces the original failure and passes with the fix.
2. A linked image has a different box from its inline link. Highlighting the link's line box produced a narrow strip instead of outlining the image. The candidate uses the direct child image's bounds and scroll target without wrapping or rewriting authored markup.
3. The current Siteimprove SDK supplies an optional `child` index for text highlights. These offsets refer to a direct text child, rather than concatenated descendant text. The candidate handles that contract and rejects invalid child indices. Browser and unit regressions cover nested markup and the requested text range.

Client resources have a new versioned path so an installed candidate does not reuse cached alpha.2 scripts.

## Observed results

| Check | Result |
| --- | --- |
| CMS startup, sample import, administrator login and editor loading | Passed |
| Siteimprove settings navigation and Razor view | Passed |
| Real token connection and saving settings without API credentials | Passed |
| Connection survives CMS restart and candidate replacement | Passed |
| Real SDK panel uses the existing signed-in Siteimprove session | Passed |
| Same-origin Visual Builder prepublish capture | Passed |
| Dedicated page created, saved and published through the editor | Passed, with automatic remote rechecks disabled |
| A separate draft survives editor reload while the public page retains baseline content | Passed |
| Real scan of a linked draft image with an empty alternative | Completed; detected one Link missing a text alternative occurrence |
| Real SDK Highlight action invokes a preview decoration | Passed; the initial narrow image outline led to fix 2 above |
| Saving an image description clears the old decoration | Passed |
| Rechecking the persisted correction through the real SDK | Completed; the missing-link-alternative issue disappeared and accessibility issue types fell from seven to six |
| Published page after the correction | Retains baseline content; the draft marker is absent |
| Switching to All Properties with no preview | Shows guidance and removes both Run content check and Recheck draft controls |
| Returning to Visual Builder | Restores Recheck draft and requires a new check before using old highlights |
| Canonical public URL and versioned edit-preview URL remain separate | Passed |
| Malformed content reference and missing locale | Rejected with `invalid-content` and `invalid-language` |
| Anonymous requests to protected plugin routes | No resource returned (404); public home-page control returned 200 |

The before scan used alpha.3 and the corrected-draft scan used alpha.4 after candidate replacement. Both ran against persisted CMS content through the real overlay. The final image-box and text-child fixes have browser regression coverage; a real text-offset issue has not been exercised. Six unrelated accessibility issue types remain in the synthetic test page; the targeted issue disappeared, not every issue on the page.

Automated checks: 29 C# tests, 18 JavaScript unit tests and nine Chromium fixture tests passed. Fixtures exercise production preview/highlight code with simulated context and SDK commands; they do not replace the separate real SDK observations above.

## Remaining validation

This is one same-origin CMS 13 configuration, not a complete compatibility matrix. Ordinary-author and denied-content accounts, Opti ID group mappings, Graph, multiple applications/languages, scheduled publication, live automatic recheck delivery, API credential replacement/status failures and upgrades from production settings remain to be tested. Cross-origin draft checking is excluded. Queue delivery remains process-local and pending requests can be lost on restart.

Published-page reports cannot validate a localhost URL against a publicly crawled Siteimprove page. That requires an appropriate public URL mapping and test site. Initial shell navigation visits emitted HTTP 400 console errors; an SDK MutationObserver error was also observed during an earlier context transition. Their causes are not established by this checkpoint and should be reproduced separately. Intentional host restarts also produced expected connection/shutdown errors.

Dependency restore continues to report ImageSharp and System.Security.Cryptography.Pkcs advisories in the CMS graph. They have not been suppressed or resolved by these preview fixes. Resolve the platform dependency warnings and remaining acceptance checks before external beta deployment.
