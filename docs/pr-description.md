Title: Verify generated packages in a disposable CMS test host

Build a fresh NuGet candidate, verify its contents, and install that exact package into a disposable CMS 12 application for browser tests. Preserve the public framework/dependency range and existing functional tests. Add a release-candidate workflow that creates an unpublished GitHub Release after all required tests pass, attaching the exact tested package, checksum and manifests.

Load the Siteimprove overlay asynchronously through a packaged local loader so a CDN outage cannot block CMS startup. Preserve pending commands and use the current overlay handler after it loads. The settings-persistence test waits for the completed save response before reloading.

The CMS tests use real login, pages and persisted settings with controlled Siteimprove responses. They do not verify live reports. PR15 addresses a separate redirect defect in hosts with conventional routing; that fix is not included here.

Validation on September 15:

- [Package and CMS checks passed](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/34987032927): package verification, six damaged-package controls, exact-package installation, CMS startup and all five editor tests, including delayed and failed overlay loading.
- [Functional checks passed](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/34987033230): 57 backend cases on each of .NET 6 and .NET 8, 20 browser checks and separate non-blocking observations.
- Nine JavaScript and 11 Python unit tests passed, including loader deduplication, queued commands and draft-release safeguards.

See `docs/validation.md` for validation history and limitations. Release-candidate dispatch, actual draft creation, customer upgrades and live Siteimprove reports remain untested. No package was published.
