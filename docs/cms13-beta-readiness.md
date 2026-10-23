# CMS 13 beta readiness

Checkpoint: 23 October 2026. Candidate: `5.0.0-alpha.10`, built from `5a60a7830ee21aaa0753ebabad1840af7953fca6`. This remains an internal installation-test candidate. It is not a beta or GA release.

## Proposed initial beta scope

- CMS 13, .NET 10, one application and a server-rendered preview on the CMS origin.
- Visual Builder page checks, element/text highlighting, correction and rechecking. Checks are advisory; they do not block publication.
- All Properties guidance when the preview is unavailable.
- Cross-origin draft checking/highlighting, standalone blocks/sections, custom asynchronous frontends and multiple applications are excluded until separately validated.
- Automatic rechecks after publishing are removed. Publication has no plugin event handler, background queue or recheck API call.

The compatibility matrix must name the actual CMS, .NET, hosting and browser versions before invitations are sent. The NuGet dependency range is not evidence that every CMS 13 release has been tested.

## Evidence available

| Area | Evidence | Limit |
| --- | --- | --- |
| Automated regression suite | 35 C# checks, 18 JavaScript unit checks and 16 Chromium fixtures pass | Simulated CMS/SDK context in fixtures |
| Real CMS installation | Alloy 2.0.1 with CMS 13.0.0, SQL Server 2022 and local ASP.NET Identity | Opti ID, Graph and Content Manager are not configured |
| Real Siteimprove workflow | Initial image check/fix/recheck passed; alpha.10 completed a fresh draft check with no CMS API credentials, returning 5 accessibility and 10 SEO issue types | Image correction checkpoint used alpha.3/alpha.4; full browser and entitlement-denial coverage remains open |
| Real text highlights | Alpha.6 scanned the Swedish page variant; the SDK highlighted `publicerad` at the word's exact DOM range bounds without changing the paragraph HTML | One real text-offset example; nested-child cases also have fixtures |
| Languages | English draft and Swedish published variant selected through the editor; the overlay uses the Swedish public URL and returns Swedish page results | Language-specific domains and fallback rules remain unverified |
| Candidate replacement and legacy settings | Alpha.8 installed in the running CMS; a real DDS fixture with `LatestUI=false`, obsolete credentials and no connection automatically provisioned a connection, normalized the preference and cleared credentials while retaining mappings/recheck choice | A production CMS 12 database upgrade remains untested |
| Admin settings | No token, API credentials, activation status or v1 selector; live saves and mapping validation exercised in CMS 13 | Full keyboard, screen-reader and accessibility review remains open |
| HTTP access and settings | 53 checks pass against the clean local CMS host: administrator, author, read-only editor, unprivileged and anonymous requests; draft/content denial; antiforgery; mapping preservation; removed actions | Local Identity sessions; Opti ID group mappings still require staging |
| Hosted CI | [Validation for commit `5a60a78`](https://github.com/Siteimprove/CMS-plugin-Optimizely/actions/runs/39929681222) passed on Ubuntu 24.04, including all 69 regression checks and package/consumer checks; its exact package was installed locally and its assembly/module bytes verified | Repeat for the exact release candidate; this does not clear external acceptance gates |
| Package validation | Resource version/source-byte checks and isolated-cache consumer restore/publish are automated | A consumer publish fixture does not initialize CMS services |

The [earlier local validation record](cms13-local-validation.md) describes the initial installation and live image-correction evidence.

The installed alpha.10 CI package has SHA256 `85f3eafac0584657a00046a27954ee0fd02bc47e92450cdedc5e9074b090a1b5`. Its plugin assembly and protected module were verified against the running host. Temporary local sign-in/route diagnostics were removed, the host was rebuilt and restarted, and all 53 HTTP checks passed again. Its live SDK scan reproduces the corrected highlight guidance. Test-account cookies, credentials, content and raw HTTP responses remain outside the repository.

The public `https://cdn.siteimprove.net/cms/overlay-v2.js` reference sampled on 23 October has SHA256 `3569c47eff97839820f7ac334c377a1b2a36be0e7d84e8cadafc981fbfa5a5d4`. This records the CDN reference fetched for the checkpoint; it does not pin future SDK responses or prove every browser loaded identical cached bytes.

The earlier HTTP routing failure is resolved in the acceptance client: the local Alloy host requires `Accept-Encoding: gzip` for these routes. The client decodes gzip and requires a successful administrator/version positive control before interpreting denied requests. An unpublished draft also requires more than Read permission under CMS's content access evaluator. The fixture now gives its author edit access only to the synthetic page and separately verifies that a read-only editor can resolve its published version but receives denial for the draft. No plugin authorization rules were relaxed.

## Changes made during beta preparation

- Settings submissions merge with the current connection inside the repository lock. Automatic setup coalesces concurrent first requests and throttles outages. Neither is a distributed concurrency guarantee.
- Legacy credentials/status/activation controls are removed; SDK access follows the signed-in subscription and permissions. Obsolete DDS credentials are cleared on writes and legacy UI preferences cannot load v1.
- Selecting the same page after a temporary context-request failure now retries, matching the editor guidance.
- The private CMS host was moved to Microsoft's checksum-verified .NET/ASP.NET Core 10.0.13 runtimes. Temporary diagnostic code was removed from its built assembly.
- URL mappings have accessible names, HTTP(S) origin validation, duplicate detection, preserved values on errors and save confirmation. Add and Remove work before saving; row indexes and error references stay consistent after removal.
- Alpha.10 skips highlight matches with no rendered area and explains that no visible match exists. A later visible match clears that guidance. Linked images retain their own target so a hidden first image cannot prevent scrolling to a visible match. Guidance sits at the lower left so the desktop SDK panel does not cover it. A Chromium regression reproduced the invisible-marker failure before the correction and now covers both element and text matches without rendered bounds.
- The cryptography dependency and test XML dependency use Microsoft's patched `10.0.13` packages. The refreshed plugin dependency report still lists ImageSharp 3.1.12 advisories. No advisory warnings are suppressed.
- GitHub Actions validates tests and candidate packaging with read-only repository permissions and no publishing credentials. Dependency reports are evidence for release review, not an automatic release approval.
- The CI runner is pinned to Ubuntu 24.04 and browser installation has a five-minute timeout. The moving Ubuntu image repeatedly stalled downloading font packages from its mirror; the pinned run completed successfully.

## Gates before external beta

1. **Platform dependency resolution.** Obtain an Optimizely-supported resolution for the remaining ImageSharp advisories and retest the chosen platform combination. A refreshed vendor review identified the patched ImageSharp 3.2.0 backport within the CMS range; direct references require a Six Labors build-time license key. An isolated build failed for the missing key and its NuGet audit still reported advisories. Validate the licensed combination and reconcile current advisory data rather than overriding to 4.x. Also use a maintained, patched .NET host and refresh the full host audit. Do not override the CMS constraint or suppress warnings to claim readiness.
2. **Representative authentication and services.** Provision a non-production CMS 13 environment with Opti ID and Graph configured. Optimizely documents both as mandatory for full CMS 13 functionality. Repeat the passing local HTTP acceptance cases under its editor/admin paths and group mappings. Local testing continues while that environment is unavailable.
3. **Settings migration and failure recovery.** Test existing production-shaped DDS settings, automatic first connection, concurrent settings saves, account/subscription denial in the SDK, outages and return to service. Regression checks exercise the real repository merge/migration logic using a storage substitute, plus connection coalescing, timeout, cancellation and retry cooldown. A real CMS 13 DDS legacy-settings fixture also passed; full CMS 12 database migration and real SDK entitlement-denial tests remain open.
4. **Candidate review.** Have another maintainer review the full port, including access controls, legacy settings migration, SDK integration, URL mapping, event handling and package installation. Review this session's changes as well. The implementation review performed during development does not replace independent release review.
5. **Release operations.** Obtain a green hosted CI run for the exact candidate commit, select the supported compatibility matrix, nominate a feedback/support contact and approve installation, backup and rollback instructions. Produce and retain a versioned package, source commit, checksum and overlay asset identity for each invitation.

References: [CMS 13 installation requirements](https://docs.optimizely.com/cms-13/docs/install-cms13), [Microsoft PKCS patch advisory](https://github.com/advisories/GHSA-846f-f764-76mx), [Microsoft XML patch advisory](https://github.com/advisories/GHSA-7hqp-7c5m-4vq6).

## Beta exit and GA

Run the [acceptance script](cms13-testing.md) with a small named tester group on representative, supported environments. Record candidate versions and sanitized reproduction steps. Close blockers involving incorrect draft capture, incorrect highlights, lost settings, unauthorized access or disruption to editing/publication. Recheck affected acceptance steps after fixes.

GA additionally requires a signed-off compatibility matrix, successful installation/migration/rollback on the supported hosting configurations, browser and author/admin UX coverage, resolved material findings and documented support/known limitations. Cross-origin checking may remain excluded from GA if the support scope says so explicitly.
