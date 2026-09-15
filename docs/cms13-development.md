# CMS 13 development status

Experimental work; no release date or production support commitment.

## Scope

The intended workflow is to edit a page in Visual Builder, run a Siteimprove pre-publish check, highlight an issue in the preview and check again after correcting it. The panel should retain page context when switching to All Properties. This workflow still needs live validation.

Same-origin preview support is the initial target. Cross-origin preview support requires a frontend bridge and confirmation of a supported Siteimprove capture interface. Browser access guards in this branch do not enable cross-origin checks.

## Validation

The initial port was built against CMS 13.0.0. Local checks cover four C# settings tests and five JavaScript preview/navigation tests. Package assets were also checked in a clean ASP.NET project, without initializing CMS services or a CMS database.

These checks do not establish CMS startup, Visual Builder compatibility, successful Siteimprove scans or production readiness. Retest the current branch using the README commands before review.

## Access changes

The `siteimprove:admin` policy retains Administrators, WebAdmins, CmsAdmins and SiteimproveAdmins. The separate `siteimprove:use` policy also permits CmsEditors, WebEditors and SiteimproveEditors. Page URL lookup checks content read access. Actual Opti ID group mappings and direct endpoint access require live tests.

Token rotation is POST-only and preserves settings. Admin submissions validate antiforgery tokens. Existing API keys are not rendered back to the browser; leaving the replacement field blank retains the stored key. Existing DDS credential storage remains unchanged.

## Remaining work

- Verify clean CMS startup, module routes, protected assets, Razor views and navigation.
- Verify existing settings survive installation upgrades and test real author/admin permissions.
- Validate same-origin Visual Builder pre-publish checks and element/text highlighting against Siteimprove.
- Build the cross-origin bridge only against a supported capture contract; validate message origins, revisions and stale-result handling.
- Improve preview availability feedback and containing-page context for blocks and sections.
- Test language-specific domains, multiple applications and custom headless public routes.
- Replace blocking API calls and implement recoverable background rechecks, including scheduled publishing and frontend delivery delays.
- Review the legacy backend recrawl contract before retaining that behaviour.
- Add connection diagnostics, accessible UI feedback and a protected credential-storage migration where appropriate.
- Establish a tested compatibility matrix before proposing a release.

## Test environment

A CMS 13 installation with .NET 10 and its platform services configured; an admin and ordinary author account; a Siteimprove test account with pre-publish access; representative pages, blocks and languages; and both a same-origin preview and a separately hosted preview frontend that can be modified.

Keep credentials in normal environment secret configuration, outside the repository.

## Release boundary

Local experimental packages are for development testing only. Do not publish NuGet packages, create releases or describe CMS 13 as supported until live validation and maintainer approval are complete.
