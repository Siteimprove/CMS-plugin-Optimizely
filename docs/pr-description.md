Title: Verify generated packages in a disposable CMS test host

Build a fresh NuGet candidate, verify its contents, and install that exact package into a disposable CMS 12 application for browser tests. Preserve the public framework/dependency range and existing functional tests. Add a separate release-candidate workflow that creates an unpublished GitHub Release after all tests pass. Attach the exact tested package, checksum and manifests; no feed upload or public release is performed.

The CMS tests use real login, pages and persisted settings with controlled Siteimprove responses. They do not verify live reports.

Validation on September 15:

- [Linux package/CMS workflow passed](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/34962695111): package checks, six damaged-package controls, exact-package installation, CMS startup and all five editor tests.
- [Functional workflow passed](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/34962695101): 57 backend cases on each of .NET 6 and .NET 8, 20 browser checks and separate non-blocking observations.
- Four JavaScript and three Python unit tests passed. All three workflow definitions passed actionlint.
- Smoke-script execution took 57.45 seconds including database startup, CMS readiness, browser tests and cleanup; earlier dependency installation/build steps are excluded.

See `docs/validation.md` for the tested source, candidate checksum and limitations. The draft-release helper passes eight local unit tests covering candidate identity/checksums, package rejection, existing releases/tags, API failures and draft-only creation. Release-candidate dispatch, actual draft creation and live Siteimprove reports remain untested. No package was published.
