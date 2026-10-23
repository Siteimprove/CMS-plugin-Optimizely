# Siteimprove for Optimizely CMS 13 — experimental

**Experimental CMS 13 port. Incomplete and not supported for production. No release date committed.**

This branch contains work toward CMS 13 compatibility, based on the existing CMS 12 plugin. It is intended for development and review. The local package version `5.0.0-alpha.10` identifies a test build; it does not announce a release or a support commitment.

Visual Builder is the intended visual editing experience. Same-origin Alloy previews, real prepublish results and issue highlighting have been exercised in a local CMS 13 installation; see the [validation checkpoint](docs/cms13-local-validation.md) for the fixes, evidence and remaining checks. Cross-origin pre-publish checking and highlighting are not implemented.

For the existing CMS 12 implementation and installation instructions, see the repository's default branch.

## Preview scope for an initial beta

An initial beta would target rendered previews served from the same origin as the CMS: the same protocol, hostname and port. A separate hostname, subdomain or port makes a preview cross-origin even when both applications belong to the same organization.

| Capability | Same-origin preview | Cross-origin preview |
| --- | --- | --- |
| Published-page insights | Intended for testing where a public URL resolves | Intended for testing where a public URL resolves |
| Draft pre-publish checking | Initial beta target; live verification required | Not implemented |
| Issue highlighting in the rendered draft | Initial beta target; live verification required | Not implemented |

The current pre-publish integration reads the preview iframe's document directly. Browsers block that access across origins; CORS does not enable it. Cross-origin draft checks and highlighting need a frontend script to capture the rendered page and receive highlight instructions, plus a supported Siteimprove capture interface.

Unavailable previews now remove the draft-check action and show guidance in the editor. Checks require a visible preview whose URL matches the CMS-generated page, language and draft URL, followed by a settled render. For asynchronous same-origin frontends, see the explicit readiness marker in the testing guide. If participating sites use separate preview frontends, cross-origin support must be completed before inviting them to test draft checking.

Publishing does not trigger automatic Siteimprove rechecks. Authors can use the Siteimprove panel to request checks manually. Checks remain advisory and do not block publication.

## Implemented so far

- .NET 10 Razor class library, CMS 13 dependency range, corrected transitive NuGet build target and module packaging.
- CMS 13 Application-based URL resolution with explicit language, canonical public URLs and preview tokens disabled.
- System.Text.Json replaces the implicit Newtonsoft dependency.
- CMS 13 navigation TagHelpers and removal of the hardcoded legacy favicon path.
- Separate `siteimprove:use` and `siteimprove:admin` policies; page URL lookup checks content read access.
- Automatic background connection setup, antiforgery-protected settings saves and validated public URL mappings.
- The v2 Siteimprove experience only. Prepublish access follows the signed-in account’s subscription and permissions; no API credentials or activation controls are shown in CMS settings.
- Stale asynchronous page/token responses no longer overwrite the current author context.
- Draft checks are disabled during navigation and unreadable/loading previews. Highlighting is invalidated by content and viewport changes and does not wrap authored text or images.
- Settings reads perform no remote requests. Automatic connection setup is asynchronous, with outage guidance and retry throttling.
- URL mappings can be added and removed before saving, with accessible controls and validation.
- CMS 13 uses the Siteimprove v2 SDK; the legacy experience flag is retained in stored settings for compatibility.
- Patched MailKit minimum 4.16.0 because CMS 13.0 selects an affected transitive version (GHSA-9j88-vvj5-vhgr).

## Build and test

Requirements: .NET 10 SDK and Node.js 22 or later. Restore uses NuGet.org and the Optimizely feed configured in `NuGet.config`.

```sh
dotnet build SiteImprove.Optimizely.Plugin.sln -c Release
dotnet test SiteImprove.Optimizely.Plugin.sln -c Release
node --test tests/preview.test.cjs

# Browser fixtures, without a CMS installation
npm ci
npx playwright install chromium
npm run test:browser
```

Builds do not automatically create a NuGet package. To create an experimental package locally for installation testing:

```sh
dotnet pack SiteImprove.Optimizely.Plugin/SiteImprove.Optimizely.Plugin.csproj -c Release -o artifacts/packages
```

Generated packages are ignored by Git. The CMS 13 validation workflow runs the C#, JavaScript and Chromium suites, builds a candidate package, checks its resources and publishes a clean consumer fixture. It records dependency advisories and retains validation artifacts. It does not publish to NuGet or create a release; a green validation job does not resolve the separate dependency and live acceptance gates.

To repeat the package and consumer checks locally after packing:

```sh
python3 tests/verify-package.py artifacts/packages/SiteImprove.Optimizely.Plugin.5.0.0-alpha.10.nupkg --publish-host
```

See the [beta readiness checklist](docs/cms13-beta-readiness.md) for completed checks, remaining release gates and the proposed limited beta scope.

See [the installation testing guide](docs/cms13-testing.md) for candidate setup, readiness integration, test steps and rollback.

See [development status and remaining work](docs/cms13-development.md) for validation limits, access changes and the test environment needed.
