# Functional tests

These tests cover the plugin's configuration, URL handling, authorization,
publishing integration, and browser callbacks. No Siteimprove account, API key,
Optimizely database, or running CMS site is needed. All credentials and content
are fixtures; the tests do not send requests to Siteimprove.

## Backend

Install the .NET 8 SDK and ASP.NET Core 6 runtime, then run:

```sh
dotnet restore tests/Plugin.Tests/Plugin.Tests.csproj --locked-mode
dotnet test tests/Plugin.Tests/Plugin.Tests.csproj --configuration Release --no-restore -p:GeneratePackageOnBuild=false --logger 'trx;LogFilePrefix=backend' --results-directory test-results/backend
```

The 28 backend cases run on both .NET 6 and .NET 8. The tests build and reference
the actual plugin project and locked Optimizely dependencies. They do not establish
compatibility with every CMS 12 release. The plugin still targets .NET 6, which
produces an end-of-support build warning; this PR does not change that target.

| Area | Coverage |
| --- | --- |
| Page URL controller | Revision and language; direct Block request returns HTTP 400 without a typed Page lookup. |
| URL mapping | Host/scheme/port matching; preservation of page paths and query strings; independent sites and language paths; missing URLs/sites and resolver errors. |
| Admin actions | Prepublish enablement success and failure. |
| Authorization | Real ASP.NET middleware and production policy/controller attributes; all four configured roles; anonymous and unauthorized callers; protected reads and writes. |
| Publish events | Recheck URL/token; disabled rechecks, Blocks, missing URLs and background events; start-page recrawl transition. |
| Overlay selection | Exactly one script matching the latest-interface setting. |

Optimizely content, URL/site resolution, settings access and outgoing service
calls are test doubles. These checks do not exercise the settings repository,
HTTP service implementation, database schema creation, SQL serialization or
multi-server locking.

Authorization tests run in ASP.NET TestServer with a fixture authentication
handler; production policies and controller attributes enforce access. This
does not test actual CMS login or SSO.

## Browser

With Node.js 24:

```sh
npm ci
npx playwright install --with-deps chromium firefox
npm test
```

There are 20 functional checks: ten scenarios in Chromium and Firefox. They load
the complete JavaScript file from the checkout, not a copied implementation or
downloaded snapshot. Two loopback HTTP servers provide real iframe navigation,
redirects, origin boundaries, and browser-enforced frame restrictions.

Coverage includes draft capture, URL/token/revision/language handoff, Page to
Block to Page transitions, missing context, initial Block-to-Page setup, recovery
after a URL lookup failure, iframe navigation/replacement, and handing the current
preview document to the highlighting callback.

The AMD loader, CMS subscriptions, URL/token responses and Siteimprove queue are
fixtures. The real Dojo runtime, editor and Siteimprove overlay are not loaded.
No accessibility scan runs, and CMS draft rendering and Siteimprove results are
not tested.

### Failure diagnostics

Failed browser tests save a full-page screenshot and trace; successful tests do
not save screenshots. Use `npm run test:report` to inspect the HTML report.
Screenshots show the fixture editor/preview. Assertion output and traces are more
useful for request/queue errors without a visible symptom. These are diagnostic
attachments, not image-baseline comparisons.

Missing/blocked-preview observations run separately:

```sh
npm run test:observations
```

These ten checks record the current null/SecurityError behavior in both browsers.
Passing means the behavior was observed, not that the real overlay recovered
gracefully. They are excluded from the default functional test command.

## GitHub Actions

`Plugin functional tests` runs on pull requests, pushes to main and manual dispatch.
`Backend functionality` runs both .NET targets. `Browser functionality` runs both
browsers and uploads HTML reports, failure screenshots and traces. Observations
run in a separate non-blocking step with their own report: an unexpected observation
failure remains visible there but does not override the functional test result.

The workflow has read-only repository permissions, requires no secrets, and does
not publish a package or deploy a site. Artifacts are retained for 14 days.
Repository owners can require the two functional jobs in branch protection.

## Regression evidence and remaining acceptance

This test-only change builds on the existing Block-context fix. Browser context
regressions were verified against the code preceding that fix.

Additional checks exposed configuration loss during token creation/renewal,
missing first-save mappings, empty/non-web mapping inputs, publish-subscription
cleanup, and successful logging of HTTP recheck failures. Production fixes and
the tests for those paths are kept in a separate follow-up PR so this suite can
pass independently against the existing plugin behavior.

Still validate installation/module loading in a real CMS, actual editor event
timing, database persistence, and representative CMS configurations. A separate
authenticated Siteimprove smoke test should resolve a known public page and
confirm a fresh Prepublish scan detects a deliberate issue in the current draft.
