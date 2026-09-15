# Validation record

## Successful Linux CMS run

On September 15, both [package/CMS integration](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/34962695111) and [functional tests](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/34962695101) passed for PR head `f2ab4f8a772898d68273029517309cdb75a771fb`.

- A clean candidate built and passed package checks and all six damaged-package controls.
- The CMS host installed the candidate through NuGet; DLL/ZIP bytes and assembly identity matched.
- SQL schema creation, seed content, CMS startup and real login completed.
- All five CMS browser tests passed, with zero failures or skips, in 27.41 seconds. Coverage includes settings persistence, mapped page context, current preview callbacks, repeated navigation, delayed/failed overlay loading and restricted-user access.
- The functional workflow passed both .NET targets and both browsers.

GitHub tested a temporary merge commit, which is the source recorded in the package manifest:

- Source: `732eff689d77d7b17bce89c29f3ff43a7ded70b2`
- Candidate: `4.3.4-ci.34962695111.1.g732eff689d77`
- SHA-256: `41ff1f0260353ed1245ddb0d8a2c601e5301dc7cac22ddded29adacd97c6066a`

The smoke script measured SQL readiness at 21.06 seconds, CMS readiness at 27.4 seconds, and tests/cleanup complete at 57.45 seconds from script start. SQL memory was 778.7 MiB at the recorded sample. These timings exclude earlier package build, host restore and browser installation steps.

The first two Linux runs exposed test assumptions about the status-card text and collapsed navigation pane. Those selectors were corrected; production plugin code was unchanged. The completed run uses controlled Siteimprove responses and does not verify live reports. Release-candidate dispatch and other CMS/browser baselines remain untested. No package was published.

## Earlier local validation

Validated on September 15, 2026, after rebasing `build/cms-integration-reconciled` onto merged main at `b23e48e7b12d8b3170d4595be28b61c16b39eeef`. Tested source commit: `04bd93a81da3aaae75610a9ddb7933003627774a`.

The rebase retained the lockfile exclusion merged in #12 and the draft's portable package paths. The resulting source tree matches the previously reviewed automation draft. No branch was pushed, PR opened, or package published during this validation.

Environment: ARM64 macOS, .NET SDK 8.0.425, .NET/ASP.NET Core 6.0.36 and 8.0.31, Node 24.6.0, Python 3.9.6 and Playwright 1.63.0. Linux runner validation and the new CI Node 22.23.2 baseline remain pending.

| Validation | Result |
| --- | --- |
| Locked backend dependency restore | Passed |
| Backend tests on .NET 6 | 57 passed, 0 failed/skipped |
| Backend tests on .NET 8 | 57 passed, 0 failed/skipped |
| Chromium/Firefox functional tests | 20 passed |
| Non-blocking preview observations | 10 passed; characterize existing behavior, not graceful recovery |
| JavaScript unit tests | 4 passed |
| Python package-verifier tests | 3 passed |
| Clean committed-source package build and verification | Passed; existing .NET 6 end-of-support warning remains |
| Damaged actual-candidate controls | All 6 rejected |
| Isolated exact-package CMS host restore/build | Passed; 0 warnings/errors |
| Installed DLL, protected-module ZIP and assembly identity | Exact bytes and versions verified |
| CMS browser test discovery | 5 tests discovered, not executed |
| All three workflows, actionlint 1.7.12 | Passed; ShellCheck not enabled |
| Python script compilation and diff whitespace | Passed |
| Real CMS startup, database, seeding, login and editor tests | Not executed; Docker unavailable locally |
| GitHub Actions / release-candidate workflow | Not executed for this branch |
| Live Siteimprove overlay/reports | Not tested |

The first .NET 6 attempt stopped before executing tests because the local ASP.NET Core 6 runtime directory was empty. Installing Microsoft's 6.0.36 runtime into temporary storage, after verifying its published SHA-512 checksum, allowed all 57 cases to pass. No source changes were needed.

## Candidate identity

Version: `4.3.4-ci.20260915110214.1.g04bd93a81da3`.

SHA-256: `b7be51b773ff1e15de7f89c89c0f5f172f9038a8c47682155cc02c9880e3585b`.

The candidate was built from clean committed source (`workingTree=false`). Its manifest records the source commit, source hashes and dependency graph. This does not make it release-ready: real-CMS acceptance remains open. This validation record and related documentation were updated afterward; executable source is unchanged.

Build outputs, package binaries, local caches, browser evidence and disposable CMS state remain ignored. The original draft and prior local validation artifacts were preserved.

The successful Linux run above closes the real-CMS acceptance gap recorded by this earlier local validation. Final PR review and any branch-protection changes remain separate.

## Draft release workflow addition

Added a release-only job gated on successful functional and package/CMS workflows. It verifies the downloaded candidate before creating an unpublished GitHub Release, and attaches the exact package, checksum and manifests. It refuses existing releases and tags pointing to another commit. Only this job has write permission; no public release or feed upload is implemented.

Validation: eight new Python unit tests passed, including candidate identity/checksum rejection, failed package verification, existing draft/published release protection, tag validation, API failures, and draft-only creation with the exact assets. Together with the package tests, all 11 Python tests passed. All three workflows passed actionlint with ShellCheck disabled. GitHub API mutations are mocked in these unit tests; actual draft creation and release-candidate dispatch have not been executed.

The rerun after the draft-release addition passed the functional workflow and package/unit jobs, including all 11 Python tests. The [CMS job failed](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/34970661033) in the simulated overlay-outage test: the navigation-pane button did not appear after login. Three CMS tests passed and the final test was skipped. The earlier successful run does not establish that the current branch is green; this failure needs investigation before merge. The release gate correctly blocks draft creation when CMS checks fail.

## CMS failure fixes

Commit `7578995` passed [package/CMS validation](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/34987032927) with all five browser scenarios, including the overlay outage and reload recovery. The [functional workflow](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/34987033230) also passed. Nine JavaScript and 11 Python unit tests passed.

The outage trace showed a Dojo script-loading error while the external overlay was a required CMS module resource. A packaged local loader now starts the external script asynchronously and initializes the command queue, so failed CDN loading does not prevent the navigation toolbar from appearing. Queued callbacks and pending token responses use the current overlay handler when it arrives.

Run `34971477292` failed on an immediate reload after settings save. The server returned the correct protected-module redirect and HTTP 200; the reload encountered a browser protocol error. The test now waits for the response body and page load before verifying persisted values and reloading. This is distinct from PR15's incorrect redirect under conventional site routing.

These changes resolve the failures recorded above. Live Siteimprove and upgrade testing remain outside this controlled-response suite.
