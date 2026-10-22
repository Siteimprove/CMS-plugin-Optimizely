# CMS 13 development status

Experimental work; no release date or production support commitment.

## Scope

The intended workflow is to edit a page in Visual Builder, run a Siteimprove pre-publish check, highlight an issue in the preview and check again after correcting it. Local Alloy testing has exercised this workflow, including real image and text highlights. See the [current beta readiness checklist](cms13-beta-readiness.md) for remaining release gates and validation limits.

Same-origin preview support is the initial target. Cross-origin preview support requires a frontend bridge and confirmation of a supported Siteimprove capture interface. Browser access guards in this branch do not enable cross-origin checks.

## Validation

The [22 October local validation checkpoint](cms13-local-validation.md) records the first real CMS 13 installation, Visual Builder preview correction, live SDK results and alpha.4 highlighting fixes. The earlier evidence below describes the initial port.

The initial port was built against CMS 13.0.0. Local checks cover four C# settings tests and five JavaScript preview/navigation tests. Package assets were also checked in a clean ASP.NET project, without initializing CMS services or a CMS database.

These checks do not establish CMS startup, Visual Builder compatibility, successful Siteimprove scans or production readiness. Retest the current branch using the README commands before review.

## Access changes

The `siteimprove:admin` policy retains Administrators, WebAdmins, CmsAdmins and SiteimproveAdmins. The separate `siteimprove:use` policy also permits CmsEditors, WebEditors and SiteimproveEditors. Page URL lookup checks content read access. Actual Opti ID group mappings and direct endpoint access require live tests.

CMS settings require the admin policy and antiforgery validation. SDK v2 sign-in handles subscription and user permissions; legacy API activation/status calls and credential inputs have been removed. An internal connection identifier is provisioned asynchronously on demand, reused, and never shown in settings. A process-wide gate coalesces initial requests and throttles failures for one minute. Settings reads and resource discovery remain free of remote requests. Saving settings clears unused legacy API fields and normalizes the old UI preference; the resource provider unconditionally loads v2. DDS fields remain only for schema compatibility.

## Remaining work

- Repeat the locally verified startup, assets, Razor views and navigation in a representative Opti ID/Graph staging installation.
- Verify existing settings survive installation upgrades and test real author/admin permissions.
- Broaden the verified same-origin check/highlight/correction workflow across the supported browser and site matrix.
- Build the cross-origin bridge only against a supported capture contract; validate message origins, revisions and stale-result handling.
- Improve preview availability feedback and containing-page context for blocks and sections.
- Test language-specific domains, multiple applications and custom headless public routes.
- Automatic publication rechecks were removed in alpha.9; publishing no longer registers a plugin event handler or starts a recheck queue.
- Published-page checks can be requested manually through the Siteimprove panel.
- Test account/subscription denial and sign-out with the hosted SDK, including guidance for unavailable previews.
- Establish a tested compatibility matrix before proposing a release.

## Test environment

A CMS 13 installation with .NET 10 and its platform services configured; an admin and ordinary author account; a Siteimprove test account with pre-publish access; representative pages, blocks and languages; and both a same-origin preview and a separately hosted preview frontend that can be modified.

Keep credentials in normal environment secret configuration, outside the repository.

## Release boundary

Local experimental packages are for development testing only. Do not publish NuGet packages, create releases or describe CMS 13 as supported until live validation and maintainer approval are complete.

## Code review checkpoint — 13 October 2026

Reviewed the C# controllers, settings persistence, URL resolution, publication events, Razor settings UI, protected-module packaging and JavaScript preview integration at commit `62cac81`. Four C# and five JavaScript regression tests passed again. Focused JavaScript simulations reproduced an available callback returning null for a cross-origin preview and a callback capturing the previous page during navigation. No running CMS installation or Siteimprove scan was exercised.

Findings below include behaviour inherited from the CMS 12 implementation. Existing tests passing does not resolve them.

### Initial findings, addressed in 5.0.0-alpha.2

1. **Bind checks and highlights to the selected draft.** `siteimprove.js` tracks revisions for URL/token responses, but its pre-publish and highlight callbacks independently read whichever `sitePreview` document exists. During navigation to a new page, they can still capture the old completed document. `readyState === "complete"` also does not prove that asynchronous frontend rendering has completed. Disable checking during transitions and validate page, language and draft revision at capture time. Invalidate highlights/results after relevant changes.
2. **Remove unavailable pre-publish actions.** The callback is always registered after authorization, even when the iframe is cross-origin, missing, blank or loading. Those cases return null while the action remains advertised. Update availability as the preview changes and show an actionable explanation. Keep a cross-origin preview out of draft-check testing until its bridge exists.
3. **Keep service outages from delaying editing and publication.** `ClientResourceProvider` reads settings while building editor resources. If the token is absent, `SettingsRepository` requests it synchronously under a shared lock. Publication events also call synchronous HTTP directly. A slow request can hold editor/settings requests or delay the publish response until the HTTP timeout; failed token generation repeats on later settings reads. Remove outbound HTTP from ordinary settings reads and resource discovery, add bounded asynchronous API handling, and dispatch rechecks independently of publishing.
4. **Distinguish an unavailable status from disabled pre-publish.** `GetPrepublishCheckEnabled` returns false for network failures, authentication failures and malformed responses. The admin view displays all of these as Disabled. Return a status that allows the UI to distinguish configuration, entitlement and service failures, with an appropriate retry action.

### Additional beta preparation

- Run clean installation and existing-settings upgrade tests against a real CMS 13 database. Test author/admin permissions and antiforgery behaviour through HTTP rather than direct controller calls.
- Test the full Visual Builder check/fix/recheck workflow, All Properties switching, language/application changes and block/section selection. The current client clears page context on non-page selection.
- Test service failures, expiry/logout, content read denial, failed rechecks and frontend render delays. Current regression tests do not exercise these paths.
- Record the CMS version, package version/commit and overlay version used for each beta build. The v2 overlay URL can still receive patch updates; record its exact version for reproducible beta results.
- Provide installation and removal instructions, a settings/database backup and restore procedure for upgrade tests, known limitations, a test script and a feedback contact.
- Scheduled/background rechecks may remain excluded from a limited beta if stated clearly. Multi-site/headless routes and cross-origin draft checking need verification before those configurations are included.

### Resolution in 5.0.0-alpha.2

The four findings above are addressed in the local candidate. Preview checks now require a matching, visible, settled document and revalidate before returning it. Mutation, navigation and viewport changes invalidate highlighting. Unavailable previews unregister the check callback and show guidance. Settings reads and resource discovery perform no remote requests. Connection/status actions use asynchronous HTTP with a ten-second timeout; status results distinguish disabled, unconfigured, rejected credentials, denied access and unavailable service. Publication events enqueue bounded background rechecks with limited retries.

For asynchronous same-origin rendering, the frontend must set `data-siteimprove-preview-ready="false"` on the body before an update and `"true"` after rendering the selected draft. A quiet DOM alone cannot prove that an application has finished its asynchronous work. See the testing guide.

The background queue is process-local and is not restart-safe. Delivery delay is configurable, but it is not a delivery-ready acknowledgement from a headless frontend. CMS 13 uses the v2 overlay URL; record its exact version during live tests because patch updates remain possible.

The candidate remains experimental. Browser fixtures use real Chromium with simulated CMS context/endpoints; they do not prove actual Visual Builder lifecycle or Siteimprove result compatibility. Live CMS and account tests remain required.


### Verification and remaining dependency gate

The candidate passed 29 C# tests, 17 JavaScript tests and five Chromium fixture tests. The C# tests include the CMS 13 Visual Builder experience/page type contract, API/status failures and background queue behaviour. The candidate package was restored and published in a clean ASP.NET host fixture; the updated protected module and assembly were present in its output. This fixture did not initialize CMS services or connect to a CMS database.

Clean-host restore reported ImageSharp advisories for the version selected by CMS 13.0.0 (`SixLabors.ImageSharp` 3.1.12). The inspected CMS packages constrain it to `[3.1.12,4.0.0)`. The initial check identified 4.1.2 as patched outside that range. A refreshed review on 22 October identified the vendor’s 3.2.0 security backport within the CMS range. Direct references to 3.2.0 require a Six Labors build-time license key; the supplied Optimizely license is not evidence of that entitlement. Validate a licensed 3.2.0 platform combination and refresh the host audit before external beta. Do not suppress warnings or bypass license enforcement. This dependency check is not a finding that the Siteimprove code itself reaches the affected image-processing paths.

References: [TIFF T4 advisory](https://github.com/advisories/GHSA-j9gm-c75j-xc9q), [histogram equalization advisory](https://github.com/advisories/GHSA-j3p4-wp97-rph4), [TIFF T6 advisory](https://github.com/advisories/GHSA-jjfr-hcj7-qf5w).


### Settings simplification in 5.0.0-alpha.8

[Siteimprove's current security FAQ](https://help.siteimprove.com/support/solutions/articles/80000448234-cms-plugin-security-faq) confirms that manual API credentials/tokens are unnecessary and Prepublish/Live access follows subscription and user permissions. The real CMS workflow already succeeded with empty legacy API inputs. Alpha.8 removes those controls and the misleading API status/activation path, while retaining the internal identifier required by the SDK input and published-recheck integration. There is no v1 resource fallback.

The settings form now rejects invalid, incomplete and duplicate origin mappings with visible, field-associated errors and preserves submissions on failure. Saving merges with the latest connection. Existing DDS fields are retained for compatibility but are no longer accepted from the form; obsolete credentials are cleared on writes.

The dependency follow-up uses the vendor's [3.2.0 release](https://github.com/SixLabors/ImageSharp/releases/tag/v3.2.0), [T4 advisory](https://github.com/SixLabors/ImageSharp/security/advisories/GHSA-j9gm-c75j-xc9q) and [v3 build-time licensing documentation](https://docs-v3.sixlabors.com/articles/imagesharp/index.html). This corrects the earlier assumption that only an incompatible major-version upgrade was available. An isolated 3.2.0 build confirmed that the current environment lacks the required Six Labors key. Its NuGet audit still reported the five advisories, so reconcile the feed data with the vendor’s updated ranges before claiming the dependency gate is clear. No dependency override or warning suppression was added.


### Mapping editor and publication changes in 5.0.0-alpha.9

Automatic checks after publication are removed, including event subscriptions, queue registration and the recheck API client. The DDS preference remains only for schema compatibility and is cleared on writes. Manual checks in the hosted Siteimprove experience remain available.

Add mapping creates another row immediately and focuses its first field. Remove deletes the selected row without submitting. A single settings save applies all changes. Remaining input names, accessible labels and error references are renumbered after deletion so removing a middle row does not lose later mappings. Regression fixtures use the production row template and script.
