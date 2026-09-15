# Siteimprove for Optimizely CMS 13 — experimental

**Experimental CMS 13 port. Incomplete and not supported for production. No release date committed.**

This branch contains work toward CMS 13 compatibility, based on the existing CMS 12 plugin. It is intended for development and review. The local package version `5.0.0-alpha.1` identifies a test build; it does not announce a release or a support commitment.

Visual Builder is the intended visual editing experience. It has not yet been verified end to end in CMS 13. Cross-origin pre-publish checking and highlighting are not implemented.

For the existing CMS 12 implementation and installation instructions, see the repository's default branch.

## Implemented so far

- .NET 10 Razor class library, CMS 13 dependency range, corrected transitive NuGet build target and module packaging.
- CMS 13 Application-based URL resolution with explicit language, canonical public URLs and preview tokens disabled.
- System.Text.Json replaces the implicit Newtonsoft dependency.
- CMS 13 navigation TagHelpers and removal of the hardcoded legacy favicon path.
- Separate `siteimprove:use` and `siteimprove:admin` policies; page URL lookup checks content read access.
- POST-only token rotation, antiforgery validation, retained mappings, and replacement-only masked API key input.
- Stale asynchronous page/token responses no longer overwrite the current author context.
- Preview document access handles cross-origin restrictions and rejects blank/loading documents.
- Patched MailKit minimum 4.16.0 because CMS 13.0 selects an affected transitive version (GHSA-9j88-vvj5-vhgr).

## Build and test

Requirements: .NET 10 SDK and Node.js 22 or later. Restore uses NuGet.org and the Optimizely feed configured in `NuGet.config`.

```sh
dotnet build SiteImprove.Optimizely.Plugin.sln -c Release
dotnet test SiteImprove.Optimizely.Plugin.sln -c Release
node --test tests/preview.test.cjs
```

Builds do not automatically create a NuGet package. To create an experimental package locally for installation testing:

```sh
dotnet pack SiteImprove.Optimizely.Plugin/SiteImprove.Optimizely.Plugin.csproj -c Release -o artifacts/packages
```

Generated packages are ignored by Git. This branch adds no publishing or release automation.

See [development status and remaining work](docs/cms13-development.md) for validation limits, access changes and the test environment needed.
