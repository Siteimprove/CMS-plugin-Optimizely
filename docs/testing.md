# Build and CMS integration tests

Status: package build and host compilation validated locally; the real CMS browser suite still needs its first x64 Linux run. Do not make `Package and CMS checks` a branch requirement until that run succeeds. See [validation](validation.md) for actual results.

## Baseline and scope

This change builds on PR #13 (`4e2eb89a98868ae563a3af521968bb436b93e85c`), including the functional coverage from PR #12. The existing backend tests, browser tests, npm commands and functional workflow remain available. The CMS suite has its own `playwright.cms.config.ts` and `tests/cms` directory. The shared SDK pin also applies to the functional workflow, which installs that exact SDK alongside .NET 6.

The public project keeps its `net6.0` target, version `4.3.4`, and `EPiServer.CMS.UI.Core [12.0.2,13.0.0)` dependency range. The HTTP client factory constructor delegates to the existing request factory from PR #13; its error handling and regression tests are preserved. Release candidates must pass the existing functional workflow as well as the package/CMS workflow.

| Component | Pinned baseline |
| --- | --- |
| Build SDK | .NET SDK 8.0.425, no roll-forward |
| Plugin target / build resolution | net6.0 / CMS UI Core 12.0.2; complete graph in plugin lockfile |
| Test host | net8.0; EPiServer.CMS 12.34.6, hosting/core 12.24.0 |
| Browser tooling | Node 22.23.2; Playwright 1.63.0 and its bundled Chromium |
| Runner | GitHub-hosted ubuntu-24.04, x64 |
| Database | SQL Server 2022 CU22, Ubuntu 22.04 container; digest pinned in `scripts/cms_smoke.py` |

The host follows the official [starter approach](https://docs.developers.optimizely.com/content-management-system/docs/creating-a-starter-project), including `AddCms`, a page type and MVC view. The official CMS composition includes editor dependencies such as TinyMCE and ImageSharp; the host adds no search, commerce, media models, or customer content. Its full dependency graph is locked. This is one integration baseline, not evidence that every CMS 12 release is supported. Compiling successfully is not proof of runtime compatibility.

[Current CMS system requirements](https://docs.developers.optimizely.com/content-management-system/docs/system-requirements-for-optimizely) list Linux, ASP.NET Core/.NET 8 and SQL Server 2022. They support the two latest Chrome versions for editing. Bundled Chromium is our reproducible first smoke target, not a claim of complete supported-browser coverage. Review pins regularly as browser and runtime support changes. No demonstrated Windows-only dependency has been found; actual Linux startup remains to be validated.

[Microsoft's lifecycle](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core) ended .NET 6 support on November 12, 2024. .NET 8 support ends November 10, 2026. The SDK emits the .NET 6 warning; it is not suppressed. Follow up separately on a supported public target and a longer-lived CMS/runtime baseline, with a compatibility review and release notes. Do not quietly change the package target or dependency range to make this suite pass.

The old Optimizely feed URL returned 404 during inspection. `NuGet.config` now uses the responding [v3 feed](https://nuget.optimizely.com/v3/index.json).

## Confidence levels

1. Node unit tests execute the production AMD module with small Dojo/request doubles. Python checks independently inspect the generated package; damaged-candidate controls exercise the checker itself. These validate code and package content without a CMS or external account.
2. Browser tests use a real CMS application, Identity login, persisted settings and production plugin installed through NuGet. The CDN overlay is a controlled browser stub. The test-only HTTP handler supplies synthetic token, prepublish-status and server recheck responses; all unexpected calls through that handler fail closed. Production settings persistence, authorization, URL mapping, controllers and helper request construction remain in use.
3. Real Siteimprove reports, authentication, crawling and service availability need a separate protected live test. None is claimed by this suite.

The source registers `input`/`domain`, `onHighlight`, `registerPrepublishCallback`, `applyDefaultHighlighting` and `clear` queue commands. Publishing invokes the backend `cms-recheck` endpoint. There is no plugin-owned manual Recheck command or button. `Stub Recheck` verifies that the stub receives the selected URL and emits one simulated request; it does not test the real overlay's manual Recheck implementation. Prepublish coverage verifies current preview DOM delivery and stubbed configuration status, not an external content-check report.

The browser suite covers configuration persistence, two-page selection, mapped URLs, installed asset failures, repeated navigation/reload, delayed/failed CDN loading, preview callbacks, and a `WebEditors` user without an allowed plugin role. The plugin currently has no dedicated overlay error/retry UI; the failure scenario checks CMS usability and reload recovery. Selectors and these runtime expectations remain provisional until the first real CMS run. The constructor and initialization lifecycle are not redesigned by this change.

## Local reproduction

Use a clean clone, the SDK from `global.json`, Node from `.nvmrc`, Python 3.9+ and an x64 Linux machine with Docker. No .NET 6 runtime needs to be installed to run the net8.0 host. SQL Server's image is x64; this setup does not promise ARM emulation support.

```sh
npm ci --ignore-scripts
npm run test:unit
python3 -m unittest discover -s tests/unit -p 'test_*.py' -v
python3 scripts/candidate.py
python3 scripts/test_candidate.py
python3 scripts/host.py
npx playwright install --with-deps chromium
python3 scripts/cms_smoke.py
```

For uncommitted local changes only, use `python3 scripts/candidate.py --working-tree`. Such manifests explicitly identify an uncommitted build, record input file hashes, and cannot be used for a release. Move previous `artifacts/candidate` and `artifacts/host` directories aside before another candidate/run; the scripts refuse to overwrite them. Successful smoke runs remove the SQL container and App_Data. Delete disposable `artifacts`, `.nuget-ci`, and browser evidence when no longer needed.

The candidate script copies source files to an empty temporary directory and builds there. It never selects the historical checked-in nupkg. PR identities include run ID, attempt and commit; release identities must match the project. It records source commit, source hashes, SDK, version, resolved dependencies and SHA-256. Exact module paths, names, source bytes, DLL presence, metadata, targets, nested ZIP contents and file allowlists are checked. Text credential-pattern checks supplement the allowlist; they are not a general secret-scanning guarantee.

The host starts with a separate NuGet cache and source configuration. Source mapping reserves the plugin ID for the local candidate directory. It derives a host lockfile by inserting only the exact candidate version and its SHA-512 into the checked-in baseline graph, then restores in locked mode. Any other dependency drift fails restore. After compilation it compares the installed DLL and consumer-copied ZIP with the nupkg bytes. There is no project reference.

To update dependencies, deliberately restore the plugin and the host baseline without `CandidateVersion`, inspect lockfile changes, and rerun the full path. The host refuses to build without a candidate. Preserve the public dependency range while reviewing its resolved minimum graph separately from the host graph.

## Ephemeral database, authentication and licensing

`cms_smoke.py` starts one named SQL container with a random password, 3 GiB memory limit and two CPUs. Its randomly assigned port binds only to `127.0.0.1`. It polls `SELECT 1`, creates an empty database, and passes its connection string through the host environment. No database, credentials or generated candidate packages enter dependency caches. This is a disposable Developer Edition database; running the script accepts that image's EULA through `ACCEPT_EULA=Y`.

The CMS creates/updates its schema through `DataAccessOptions.CreateDatabaseSchema` and `UpdateDatabaseSchema`. Those APIs were verified in the resolved 12.24.0 XML reference. The Identity package supplies its schema updater. Seeding uses `UserManager`, `RoleManager`, `IContentRepository` and `ISiteDefinitionRepository`; it creates English content, a site, two published pages, an authorized editor and a restricted editor. Seed operations can repeat against the same schema. Passwords are random and used by actual login forms. No authentication bypass or seed write endpoint is exposed.

The host requires `CMS_TEST_HOST=1`, binds `http://localhost:5000`, and rejects non-loopback requests or other hostnames. Readiness stays 503 until seeding completes. SQL and CMS readiness have 120- and 180-second deadlines; browser execution has a 600-second limit. Teardown runs on success, failure and normal termination. GitHub discards the entire hosted runner after cancellation, including any process that cannot finish teardown.

The [CMS 12 development documentation](https://docs.developers.optimizely.com/content-management-system/docs/set-up-a-development-environment) says a license is not required on `localhost` or `domainname.local`. The [deployment documentation](https://docs.developers.optimizely.com/content-management-system/docs/deploying-content-cloud) also describes local Linux Docker development and distinguishes deployed servers. This suite applies that development exception to a loopback-only disposable application. It does not interpret it as unrestricted hosted-test or production licensing. No license file, suppression, or bypass is provided. The first run must confirm the chosen CMS build accepts this setup; if it rejects licensing, stop and seek clarification while retaining independent build/unit results.

## CI evidence and release candidates

CI runs units, clean package verification, then the real-CMS smoke suite. `Package and CMS checks` fails if any required job fails, skips or is cancelled. No `pull_request_target`, repository secrets, external accounts, publishing, paid services or self-hosted runners are used. Actions are pinned to verified release commit IDs with Node 24 runtimes (checkout 7.0.1, setup-dotnet 6.0.0, setup-node 7.0.0, upload-artifact 7.0.1, download-artifact 8.0.1); review upstream changes before updating them.

Artifacts retain the package, checksum, source/dependency manifest, resolved host graph and failure evidence for seven days. Browser traces start after login and are retained only on failures. Screenshots and console summaries use synthetic data; query strings and response bodies are not included in console summaries. Raw host logs are sanitized before upload and excluded by artifact patterns. Never use live credentials with this deterministic host. SQL readiness/CMS readiness/total elapsed time, SQL resource usage and aggregate child peak RSS are recorded when execution is possible. There are no invented startup-cost estimates; keep the full suite on PRs until measured results justify a documented change.

There was no existing tag convention. The release-candidate workflow proposes `vMAJOR.MINOR.PATCH`, or equivalent manual version input, and checks it against the source project. It calls the same CI workflow on the selected commit, including the CMS gate. Artifacts are candidates only, and a package upload alone does not mean the CMS job passed. Record the successful run URL and exact package SHA-256 before promotion. Retain/download approved bytes before artifact expiry; publishing needs separate authorization. If rebuilt, validate the new candidate again. No release or feed publication step exists.

A later live workflow should be manual, restricted to trusted source and a protected environment, with a dedicated test account and separately approved secrets for overlay authentication/API access. Supply a genuinely crawled public test URL. Use the plugin's persisted Site URL/External URL mapping, then verify the URL delivered to the real overlay; do not assume a crawler can reach runner localhost. Keep real report polling and availability failures separate from CMS/stub results. The `.invalid` mapping in ordinary tests intentionally cannot supply a live report.
