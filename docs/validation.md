# Validation record

Checked on September 15, 2026, on local branch `build/cms-integration-reconciled`, based on PR #13 at `4e2eb89a98868ae563a3af521968bb436b93e85c`. PR #12's tests and PR #13's behavior fixes are retained. No branch or PR was pushed and no workflow or package was published.

Environment: ARM64 macOS, .NET SDK 8.0.425 / runtime 8.0.31, Node 24.6.0, Python 3.9.6 and Playwright 1.63.0. The new CI jobs target x64 Ubuntu 24.04 with Node 22.23.2; those environments remain unverified.

| Validation | Actual result |
| --- | --- |
| Backend suite, locked restore, .NET 8 | 57 passed (56 existing cases and one named-client dependency-injection regression), 0 failed/skipped |
| Existing backend suite, .NET 6 | Not rerun locally; retained in the functional workflow |
| Existing Chromium/Firefox functional suite | 20 passed in 8.7 seconds |
| Existing non-blocking browser observations | Not rerun; retained separately |
| JavaScript unit tests | 4 passed |
| Python package-check tests | 3 passed |
| Clean temporary plugin build and package verifier | Passed; existing .NET 6 end-of-support warning remains |
| Damaged actual-candidate controls | All 6 rejected: missing DLL, wrong version, stale script, missing module asset, unexpected settings file, missing module source |
| Exact-package CMS host restore and compilation | Passed; 0 warnings/errors |
| Installed candidate DLL/ZIP and assembly identity | Exact bytes and versions verified |
| CMS Playwright discovery | 5 tests; separate from the 20 existing functional checks |
| actionlint 1.7.12 | All three workflows passed; ShellCheck was not enabled |
| Diff whitespace check | Passed |
| CMS smoke command | Stopped at prerequisite check: Docker unavailable |
| SQL/schema/seeding, CMS startup/license behavior, login, CMS browser tests | Not executed |
| GitHub Actions and release-candidate execution | Not executed |
| Live Siteimprove overlay and reports | Not tested |

Initial sandbox attempts could not reach NuGet or launch browsers. The permitted retries completed the package build and existing browser suite. One new unit fixture lacked the page capability required by the block-context fix; correcting the fixture produced the passing results above without changing the production page-context behavior.

Candidate: `4.3.4-ci.20260915103146.1.g4e2eb89a9886`.

SHA-256: `d72ac84a2bb5a510df10edd43ead9732993434eaef91600a333959d2c3e893d0`.

This is an uncommitted local candidate (`workingTree=true`), not a promotable release. Its manifest records source hashes and the base commit. Validation documentation, a backend test and CMS test ordering were updated after the build; the production package source was unchanged.

## Public submission review

The change inventory excludes build outputs, package binaries, local caches, browser evidence and disposable CMS state. Scanning changed/new files found no absolute personal paths, credential values matching common access-token/private-key patterns, or attribution footers. Synthetic test tokens and example.invalid URLs are intentional fixtures. This targeted review is not a general secret-scanning guarantee.

This branch adds integration coverage on top of #13; the existing functional suite and its npm commands remain available. Release candidates call that suite before package/CMS validation.

Acceptance remains open until a fresh Linux job builds a candidate, installs it, initializes the CMS and passes the real editor tests. Keep the proposed PR in draft and do not require the new `Package and CMS checks` status until that run succeeds.
