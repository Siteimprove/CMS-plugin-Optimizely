# Siteimprove for Optimizely CMS 13 — beta

**5.0.0-beta.1 is for non-production evaluation on CMS 13 and .NET 10. It is not a production support commitment.**

This beta ports the CMS 12 integration to CMS 13 and includes shared-block Prepublish checks and quieter preview feedback. Download the package from the [GitHub prerelease](https://github.com/Siteimprove/CMS-plugin-Optimizely/releases/tag/v5.0.0-beta.1) and follow the [installation and rollback guide](docs/releases/5.0.0-beta.1-installation.md). CMS 12 uses the separate 4.x release line.

Visual Builder is the intended visual editing experience. Same-origin Alloy previews, real prepublish results and issue highlighting have been exercised in a local CMS 13 installation; see the [validation checkpoint](docs/cms13-local-validation.md) for the fixes, evidence and remaining checks. Cross-origin pre-publish checking and highlighting are not implemented.

For the existing CMS 12 implementation and installation instructions, see the repository's default branch.

## Beta scope and known issues

This beta targets rendered previews served from the same origin as the CMS: the same protocol, hostname and port. A separate hostname, subdomain or port makes a preview cross-origin even when both applications belong to the same organization.

| Capability | Same-origin preview | Cross-origin preview |
| --- | --- | --- |
| Published-page insights | Available where a public URL resolves | Available where a public URL resolves |
| Draft pre-publish checking | Included for evaluation; see validation limits | Not implemented |
| Shared-block fragment checking | Live All Properties scan/fix/recheck passed | Not implemented |
| Issue highlighting in the rendered draft | Included for evaluation; see validation limits | Not implemented |

The current pre-publish integration reads the preview iframe's document directly. Browsers block that access across origins; CORS does not enable it. Cross-origin draft checks and highlighting need a frontend script to capture the rendered page and receive highlight instructions, plus a supported Siteimprove capture interface.

Unavailable page previews remove the draft-check action. Preview lifecycle messages do not appear as floating notifications in the CMS. If a check becomes unavailable while it is starting, the callback returns an error to the Siteimprove panel. Page checks require a visible preview whose URL matches the CMS-generated page, language and draft URL, followed by a settled render. CMS edit and preview modes can differ without changing that content identity. For asynchronous same-origin frontends, see the explicit readiness marker in the testing guide. If participating sites use separate preview frontends, cross-origin support must be completed before inviting them to test draft checking.

Shared blocks use the CMS 12 beta's fragment workflow. Selecting a shared block clears the page report and offers only Prepublish. A site must supply an editable block preview template on the CMS origin. A matching visible preview can be checked directly; All Properties view uses a temporary preview that is removed after capture, on navigation or on failure. Draft and language matching, render readiness and cancellation still apply. Highlighting requires a checked, matching visible preview. Media, inline block properties and blocks without an editable preview are excluded. Fragment results do not replace checking the block in its containing pages. A real shared-block scan/fix/recheck passed on CMS 13.0.2 from All Properties: a missing image alternative was detected, corrected in the draft and cleared by rechecking without publication. A later visible-preview scan failed to start; block highlighting and that layout-switch path remain unverified. See the [demo validation record](docs/cms13-demo-validation.md). Automated fixtures use controlled CMS context and SDK commands.

Publishing does not trigger automatic Siteimprove rechecks. Authors can use the Siteimprove panel to request checks manually. Checks remain advisory and do not block publication.

Known limitations include an unresolved visible-preview scan failure, host-specific CSP requirements, and ImageSharp advisories in the CMS dependency graph. Opti ID/Graph, full CMS 12 settings migration and real subscription-denial/outage paths are not fully validated. Use an isolated test environment with synthetic content and review the [release notes](docs/releases/5.0.0-beta.1.md) and dependency report before installation.

## Included in this beta

- .NET 10 Razor class library, CMS 13 dependency range, corrected transitive NuGet build target and module packaging.
- CMS 13 Application-based URL resolution with explicit language, canonical public URLs and preview tokens disabled.
- System.Text.Json replaces the implicit Newtonsoft dependency.
- CMS 13 navigation TagHelpers and removal of the hardcoded legacy favicon path.
- Separate `siteimprove:use` and `siteimprove:admin` policies; page URL lookup checks content read access.
- Automatic background connection setup, antiforgery-protected settings saves and validated public URL mappings.
- The v2 Siteimprove experience only. Prepublish access follows the signed-in account’s subscription and permissions; no API credentials or activation controls are shown in CMS settings.
- Stale asynchronous page/token responses no longer overwrite the current author context.
- Shared-block fragment checks, including on-demand capture from All Properties view and cleanup of temporary previews.
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

Builds do not automatically create a NuGet package. To create the beta package locally for installation testing:

```sh
dotnet pack SiteImprove.Optimizely.Plugin/SiteImprove.Optimizely.Plugin.csproj -c Release -o artifacts/packages
```

Generated packages are ignored by Git. The CMS 13 validation workflow runs the C#, JavaScript and Chromium suites, builds a candidate package, checks its resources and publishes a clean consumer fixture. It records dependency advisories and retains validation artifacts. It does not publish to NuGet or create a release; a green validation job does not resolve the separate dependency and live acceptance gates.

To repeat the package and consumer checks locally after packing:

```sh
python3 tests/verify-package.py artifacts/packages/SiteImprove.Optimizely.Plugin.5.0.0-beta.1.nupkg --publish-host
```

See the [beta readiness checklist](docs/cms13-beta-readiness.md) for completed checks, remaining release gates and the proposed limited beta scope.

See the [CSP and preview integration notes](docs/cms13-csp.md) before deploying to a demo server. The plugin fixtures pass a policy without inline/eval exceptions; the complete CMS editor and hosted SDK have additional requirements.

See [the installation testing guide](docs/cms13-testing.md) for candidate setup, readiness integration, test steps and rollback.

See [development status and remaining work](docs/cms13-development.md) for validation limits, access changes and the test environment needed.
