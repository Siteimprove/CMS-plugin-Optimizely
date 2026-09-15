# Validation record

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

Before merging, run a fresh Linux job that builds the package, installs it, initializes the CMS and passes the real editor tests. Keep the proposed PR in draft and do not require `Package and CMS checks` until that run succeeds. The suite controls external responses and does not establish live Siteimprove report behavior.
