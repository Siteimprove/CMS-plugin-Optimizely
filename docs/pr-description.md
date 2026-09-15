Title: Verify generated packages in a disposable CMS test host

Build and verify a fresh NuGet candidate, then install that exact package into a disposable CMS 12 application for browser tests. Add package-content checks and separate CMS and release-candidate workflows. Preserve the public framework and dependency range.

Based on main after #11, #12 and #13 merged. Preserve the existing backend/browser suites and reuse #13's HTTP request factory. The new CMS tests have a separate Playwright configuration; release candidates also run the existing functional suite.

Validation on September 15:

- 57 backend cases passed on each of .NET 6 and .NET 8, including one new HTTP client registration test; all 20 existing Chromium/Firefox functional checks and 10 non-blocking observations passed.
- 4 JavaScript and 3 Python unit tests passed. A fresh package passed verification, and all 6 damaged-package controls were rejected.
- The CMS host compiled with no warnings/errors; installed DLL/ZIP bytes and assembly identity matched the candidate.
- All three workflows passed actionlint; 5 CMS browser tests were discovered.
- Real CMS startup, login and browser execution remain unverified because Docker is unavailable locally.

The CMS suite uses controlled Siteimprove responses; it does not verify live reports. Keep this PR in draft until the Linux CMS job passes. See `docs/validation.md` for the candidate and host validation record.
