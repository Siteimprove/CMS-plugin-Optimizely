# CMS 13 beta readiness

Checkpoint: 22 October 2026. Candidate: `5.0.0-alpha.7`. This remains an internal installation-test candidate. It is not a beta or GA release.

## Proposed initial beta scope

- CMS 13, .NET 10, one application and a server-rendered preview on the CMS origin.
- Visual Builder page checks, element/text highlighting, correction and rechecking. Checks are advisory; they do not block publication.
- All Properties guidance when the preview is unavailable.
- Cross-origin draft checking/highlighting, standalone blocks/sections, custom asynchronous frontends and multiple applications are excluded until separately validated.
- Automatic and scheduled published-page rechecks remain outside the initial beta acceptance scope until tested against a public staging URL. Keep the setting off during this beta; the implementation is process-local and does not guarantee delivery across restarts.

The compatibility matrix must name the actual CMS, .NET, hosting and browser versions before invitations are sent. The NuGet dependency range is not evidence that every CMS 13 release has been tested.

## Evidence available

| Area | Evidence | Limit |
| --- | --- | --- |
| Automated regression suite | 36 C# checks, 18 JavaScript unit checks and 12 Chromium fixtures pass | Simulated CMS/SDK context in fixtures |
| Real CMS installation | Alloy 2.0.1 with CMS 13.0.0, SQL Server 2022 and local ASP.NET Identity | Opti ID, Graph and Content Manager are not configured |
| Real Siteimprove workflow | A draft image issue was found, highlighted, corrected and removed by a completed recheck | Original workflow checkpoint used alpha.3/alpha.4 |
| Real text highlights | Alpha.6 scanned the Swedish page variant; the SDK highlighted `publicerad` at the word's exact DOM range bounds without changing the paragraph HTML | One real text-offset example; nested-child cases also have fixtures |
| Languages | English draft and Swedish published variant selected through the editor; the overlay uses the Swedish public URL and returns Swedish page results | Language-specific domains and fallback rules remain unverified |
| Candidate replacement | Alpha.4 → alpha.5 → alpha.6 starts and retains the stored connection and existing draft; final alpha.6 settings save succeeds on .NET 10.0.13 | Not a CMS 12 database/settings upgrade test |
| Admin accessibility | Credential labels have unique targets, URL mapping fields have accessible names, and replacement-key guidance is associated with the field | Full keyboard, screen-reader and accessibility review remains open |
| Hosted CI | [Validation for commit `7b6a5b7`](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/39829121586) passed on Linux, including package/consumer checks | Repeat for the exact release candidate; this does not clear external acceptance gates |
| Package validation | Resource version/source-byte checks and isolated-cache consumer restore/publish are automated | A consumer publish fixture does not initialize CMS services |

The [earlier local validation record](cms13-local-validation.md) describes the initial installation and live image-correction evidence.

## Changes made during beta preparation

- Settings submissions merge with the current token inside the repository lock, preserving concurrent token rotation and replacement-only API keys within one process. This is not a distributed concurrency guarantee.
- Selecting the same page after a temporary context-request failure now retries, matching the editor guidance.
- The private CMS host was moved to Microsoft's checksum-verified .NET/ASP.NET Core 10.0.13 runtimes. Temporary diagnostic code was removed from its built assembly.
- Credential and URL mapping fields have accessible names. API key help explains that connection tokens and API credentials are separate.
- The cryptography dependency and test XML dependency use Microsoft's patched `10.0.13` packages. The refreshed plugin dependency report still lists ImageSharp 3.1.12 advisories. No advisory warnings are suppressed.
- GitHub Actions validates tests and candidate packaging with read-only repository permissions and no publishing credentials. Dependency reports are evidence for release review, not an automatic release approval.

## Gates before external beta

1. **Platform dependency resolution.** Obtain an Optimizely-supported resolution for the remaining ImageSharp advisories and retest the chosen platform combination. The currently inspected CMS range excludes the patched ImageSharp major version. Also use a maintained, patched .NET host and refresh the full host audit. Do not override the CMS constraint or suppress warnings to claim readiness.
2. **Representative authentication and services.** Provision a non-production CMS 13 environment with Opti ID and Graph configured. Optimizely documents both as mandatory for full CMS 13 functionality. Verify the plugin under the resulting editor/admin paths and group mappings.
3. **Positive and negative HTTP access tests.** Test an ordinary author, administrator, authenticated user without plugin access, and content read denial. Test valid/invalid antiforgery submissions and GET rejection for token rotation. A standalone local HTTP fixture authenticated successfully and passed direct policy evaluation, but all protected routes returned 404 before controller routing, including the administrator positive control. This run is inconclusive; its negative responses do not prove authorization enforcement. Resolve the harness/host routing difference or repeat through real sessions in staging.
4. **Settings migration and failure recovery.** Test existing production-shaped settings, blank/replacement keys, token rotation, rejected credentials, account denial, outages and return to service. Unit tests cover several failure contracts; real API credential/entitlement tests remain open.
5. **Candidate review.** Have another maintainer review the full port, including access controls, credential storage, SDK integration, URL mapping, event handling and package installation. Review this session's changes as well. The implementation review performed during development does not replace independent release review.
6. **Release operations.** Obtain a green hosted CI run for the exact candidate commit, select the supported compatibility matrix, nominate a feedback/support contact and approve installation, backup and rollback instructions. Produce and retain a versioned package, source commit, checksum and overlay asset identity for each invitation.

References: [CMS 13 installation requirements](https://docs.optimizely.com/cms-13/docs/install-cms13), [Microsoft PKCS patch advisory](https://github.com/advisories/GHSA-846f-f764-76mx), [Microsoft XML patch advisory](https://github.com/advisories/GHSA-7hqp-7c5m-4vq6).

## Beta exit and GA

Run the [acceptance script](cms13-testing.md) with a small named tester group on representative, supported environments. Record candidate versions and sanitized reproduction steps. Close blockers involving incorrect draft capture, incorrect highlights, lost settings, unauthorized access or disruption to editing/publication. Recheck affected acceptance steps after fixes.

GA additionally requires a signed-off compatibility matrix, successful installation/migration/rollback on the supported hosting configurations, browser and author/admin UX coverage, resolved material findings and documented support/known limitations. If automatic rechecks are included, verify immediate/scheduled publication, retry limits, queue saturation, delivery timing and restart behavior against real Siteimprove requests. Cross-origin checking may remain excluded from GA if the support scope says so explicitly.
