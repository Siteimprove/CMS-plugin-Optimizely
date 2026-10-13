# CST-6191: regional language URLs

## Problem and fix

When an editor selects a regional language such as `en-US`, the plugin previously loaded content with fallback disabled, then resolved its URL without passing the selected language. A page inheriting English content could therefore fail to load or be looked up under the master-language URL instead of its regional public URL.

The controller now honors configured fallback and replacement rules and passes the editor's selected locale to the URL helper. It does not enable unconditional master-language fallback. The helper requests a public URL using a content reference without the editor revision. Existing calls without an editor locale, including publish events, use the page's own language. The content object and its revision are not modified.

Optimizely's [language selector contract](https://world.optimizely.com/CsClassLibraries/cms/EPiServer.Core.LanguageSelector?version=12) supports configured fallback without unconditional master fallback. Its [URL resolver contract](https://world.optimizely.com/CsClassLibraries/cms/EPiServer.Web.Routing.IUrlResolver?version=12) accepts a language, and [URL arguments](https://world.optimizely.com/CsClassLibraries/cms/EPiServer.Web.Routing.UrlResolverArguments?version=12) let callers explicitly select public context instead of inheriting the request's context.

URL paths remain the CMS resolver's responsibility; the plugin does not manufacture a locale prefix or change its existing host mappings. A missing route still returns a null URL. The original helper method remains available, and a default implementation of the new overload delegates to it for existing custom implementations. Custom helpers must implement the new overload to gain locale-aware behavior.

## Validation on September 15, 2026

Base: local `origin/main`, commit `b23e48e7b12d8b3170d4595be28b61c16b39eeef`. Branch: `fix/cst-6191-regional-language-urls`.

Environment: ARM64 macOS, .NET SDK 8.0.425, .NET/ASP.NET Core 6.0.36 and 8.0.31. The plugin and tests restored their checked-in dependency graphs in locked mode. The obsolete feed URL was overridden for this restore with the Optimizely v3 feed; no dependency or package target changes were made. The existing .NET 6 end-of-support warning remains.

| Check | Result |
| --- | --- |
| Initial regional tests against unchanged production code | On each .NET target: 15 failed, 1 passed, none skipped |
| Same 16 cases after the fix | All passed on both targets |
| Additional missing-locale and custom-helper compatibility cases | All 3 passed on both targets |
| Full backend suite after the fix | 75 passed on .NET 6 and 75 passed on .NET 8; none failed or skipped |
| Existing Chromium/Firefox functional suite | 20 passed; none failed or skipped |
| Diff whitespace | Passed |

The failures were runtime assertions, not compilation errors: all 11 reported regional branches produced master-language URLs; configured fallback loading, translated content, public routing from a revision, and calls without an editor locale also failed. The missing-route control already passed before the fix.

The regional tests use the production controller and helper together, with test doubles for content loading, URL/site resolution and settings. They validate the language and routing contract, not Optimizely's actual fallback routing or Siteimprove crawl matching. Existing tests additionally cover host/scheme/port mapping, distinct sites, authorization, Block requests, settings, HTTP handling and publish events. One existing URL-mapping fixture was updated to expect the public reference instead of a draft revision; its output assertions are unchanged.

Local test evidence is in `test-results/regional-before/` and `test-results/backend-final/`. The browser report is in `playwright-report/`. Test reports are ignored build artifacts. To rerun the completed backend suite with suitable .NET runtimes:

```sh
dotnet restore tests/Plugin.Tests/Plugin.Tests.csproj --locked-mode --source https://api.nuget.org/v3/index.json --source https://nuget.optimizely.com/v3/index.json
dotnet test tests/Plugin.Tests/Plugin.Tests.csproj --configuration Release --no-restore -p:GeneratePackageOnBuild=false
```

Use `--filter FullyQualifiedName~RegionalLanguageUrlTests` for the 19 new cases. Browser setup and commands are in `TESTING.md`.

## Real CMS validation on October 13, 2026

The validation branch combined the original fix (`f5ac7c7412c00647e4c015470d4b33e9d6f5b600`) with `main` at `2b9d571c4a339fa9cc7bf821d6b9f9af4bc36f82` and six new real-CMS regression cases. Both runs used the same test fixtures: baseline `424a64908c4b4055dd954930bf02eb9f4c86dcc6` contained the unchanged plugin, and `de4b3cc8b3250e674da187d7e1e0f5b3b74ba486` added the fix. These tests are now included in this PR, whose branch also incorporates the later manual-only release-workflow change from `main`.

GitHub Actions builds a fresh candidate package, verifies its contents, and installs those exact DLL/module bytes into a disposable Optimizely CMS with SQL Server. Tests authenticate through the CMS and call the installed plugin's PageUrl action. Content loading, language fallback/replacement, translation, URL resolution and public rendering use the real CMS services and persisted database. External Siteimprove responses remain controlled; these runs do not check live reports.

| Check | Before the fix | With the fix |
| --- | --- | --- |
| CMS UI 12.34.6 / core 12.24.0 | 9 passed, 4 failed | 13 passed |
| CMS UI 12.32.5 / core 12.22.6 | 9 passed, 4 failed | 13 passed |
| Backend functionality on .NET 6 | Not rerun for this baseline | 85 passed |
| Backend functionality on .NET 8 | Not rerun for this baseline | 85 passed |
| Chromium/Firefox functionality | Not rerun for this baseline | 32 passed |
| Package build/verification, unit checks and package upgrade | Passed | Passed |

No CMS, backend or functional browser cases were skipped. The four failures were identical on both CMS profiles: inherited `en-US`, inherited `es-419`, translated `fr-CA` and replacement `en-GB`. The inherited and replacement lookups failed; the translated page returned `/translated-regional-page/` instead of the CMS route `/fr-CA/page-regionale-traduite/`. All four pass with the fix. The draft and missing-fallback controls, plus all seven existing CMS scenarios, passed before and after.

The six added cases verify public HTTP 200 rendering in the loaded language, regional paths for inherited and translated content, public lookup from a draft revision, and the helper overload used by publish events without an editor locale. The missing-fallback control verifies that the CMS cannot load that language and returns HTTP 404 for its regional route. It does not claim improved controller error handling for missing content. The draft check confirms that the public response contains the published translation rather than draft text.

Evidence:

- [Baseline CMS run](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/38386221440).
- [Passing package/CMS run](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/38386308478).
- [Passing backend/browser run](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/38386313515).

The passing candidate was `4.3.5-ci.38386308478.1.gde4b3cc8b325`, SHA-256 `a45835773b4c88ab3b9f27936deab1b9273c353ce9b8ff938d05e260b0ae1d74`. These results identify the validation-branch build; the updated PR head receives its own CI run and candidate identity. Actions evidence artifacts have seven-day retention, while the run logs retain the test outcomes.

To repeat the real-CMS suite, follow [package and CMS setup](testing.md) and run `python3 scripts/cms_smoke.py`. The six regression cases are in `tests/cms/regional.spec.ts` and their persisted fixtures are in `tests/CmsHost/RegionalFixture.cs`.

## Likelihood of success and merge risk

**High confidence in correcting the identified plugin defects; moderate confidence in resolving the entire customer report.** This is an engineering assessment, not a measured success probability. The failing/passing real-CMS tests establish that inherited and translated regional pages resolve to public routes on two CMS profiles. The ticket does not include a failing network request, its referenced screenshots, the customer's routing code or an exact comparison with the crawl inventory. A wrong canonical host, redirect, language-specific domain or missing crawl entry could still prevent a live report.

**The automated CMS routing gate passes on both profiles.** Customer-specific routing and live regional report matching remain release acceptance items. URL resolution is shared by the editor and publish events.

| Risk | Impact and mitigation |
| --- | --- |
| Site-specific fallback/replacement or custom routing | Explicit language and public context can change which URL a custom router returns. Check inherited and translated pages in the customer's staging configuration. |
| Editor revisions and unpublished pages | Public URL lookup from a draft of a published translation and rendering of its published content are tested in the real CMS. Never-published pages and the customer's actual draft Prepublish scan still need confirmation. |
| Existing custom helper implementations | The default overload preserves existing behavior, as verified with an implementation of only the original interface contract. Such helpers need their own locale-aware overload to benefit. Precompiled third-party implementations were not tested. |
| Crawl inventory and canonical URLs | Existing origin mappings are unchanged, including their limitations for language-specific hosts. Compare the returned URL with the exact crawled regional URL and verify the real live-page report. |
| Customer version coverage | The package is tested on CMS UI 12.34.6/core 12.24.0 and CMS UI 12.32.5/core 12.22.6, not the customer's exact 12.29.1/12.34.3 stack. Live regional Siteimprove report matching was not run for this fix. |

Before release, compare inherited `en-US`, translated `fr-CA` and numeric-region `es-419` URLs with the customer's crawl inventory and verify the corresponding live reports, draft Prepublish capture, and publish-event recheck URL. The controlled CMS tests establish routing and rendering; they do not establish regional crawl/report matching. The protected live workflow accepts `main` only and requires an existing crawled regional URL plus a suitable fixture for this acceptance check.

Merging this change does not migrate data or alter stored settings. Reverting it restores previous URL behavior. No package has been published or deployed.
