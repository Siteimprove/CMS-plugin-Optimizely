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

## Likelihood of success and merge risk

**High confidence in correcting the identified plugin defects; moderate confidence in resolving the entire customer report.** This is an engineering assessment, not a measured success probability. The failing/passing tests establish that selected locales reach the resolver and configured fallback reaches the loader. The ticket does not include a failing network request, its referenced screenshots, the customer's routing code or an exact comparison with the crawl inventory. A wrong canonical host, redirect, language-specific domain or missing crawl entry could still prevent a live report.

**Overall merge risk: medium until a representative CMS smoke test passes.** The implementation is small and the automated suite passes, but URL resolution is shared by the editor and publish events.

| Risk | Impact and mitigation |
| --- | --- |
| Site-specific fallback/replacement or custom routing | Explicit language and public context can change which URL a custom router returns. Check inherited and translated pages in the customer's staging configuration. |
| Editor revisions and unpublished pages | Public URL lookup now drops the work ID; draft content remains available to the existing preview callback. Confirm a draft of a published page and a never-published page, since actual CMS rendering/route availability is not tested here. |
| Existing custom helper implementations | The default overload preserves existing behavior, as verified with an implementation of only the original interface contract. Such helpers need their own locale-aware overload to benefit. Precompiled third-party implementations were not tested. |
| Crawl inventory and canonical URLs | Existing origin mappings are unchanged, including their limitations for language-specific hosts. Compare the returned URL with the exact crawled regional URL and verify the real live-page report. |
| Customer version coverage | Builds use locked baseline CMS 12 dependencies, not the customer's exact 12.29.1/12.34.3 stack. No real CMS or authenticated Siteimprove session was run for this fix. |

Before release, check an inherited `en-US` page, a locally translated `fr-CA` page and a numeric region such as `es-419` on representative CMS staging. Verify the plugin's returned URL, the corresponding live report, draft Prepublish capture, and the publish-event recheck URL. Also confirm that content without a configured public fallback does not acquire an invented regional route.

Merging this change does not migrate data or alter stored settings. Reverting it restores previous URL behavior. No package has been published or deployed.
