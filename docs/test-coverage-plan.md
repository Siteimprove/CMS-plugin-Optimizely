# Next test coverage

Use synthetic fixtures to reproduce reported behavior. Keep customer names, account data, internal ticket exports and private URLs outside this public repository. A reported cause is a hypothesis until a regression test reproduces it.

| Priority | Scenario | Where to test | Status |
| --- | --- | --- | --- |
| 1 | Settings save and prepublish redirects with conventional host routing | Backend HTTP tests and real CMS | Separate redirect PR; add the conventional route to a CMS fixture after integration |
| 1 | Regional language URLs, fallback, host and port mapping | Backend plus multilingual CMS fixture | Planned; coordinate with existing regional-language work |
| 1 | Real login and the report for an explicitly mapped crawled URL | Protected live smoke | Implemented; first live execution pending |
| 1 | Page → Block → Page navigation without block URL calls or exceptions | Backend/browser plus real CMS | Existing backend/browser coverage; real-CMS block fixture planned. Block support remains out of scope |
| 2 | Parallel settings reads, token requests and saves without data loss or exceptions | Backend with controlled request timing | Planned; reproduce the failure before selecting a concurrency fix |
| 2 | Upgrade an older supported package to the candidate and preserve settings | Disposable CMS, two actual package versions | Planned; fresh installation does not prove upgrade safety |
| 2 | Prepublish checks consume the current synthetic draft and complete successfully | Protected live suite | Planned; DOM handoff alone is insufficient |
| 2 | Persist an edit, recheck, verify changed results and highlight the current page | Protected live suite | Planned; reuse AEM/WordPress patterns after confirming the live UI |
| 3 | Session expiry, login recovery and restricted users | Controlled tests, then live where appropriate | Planned; direct-login smoke does not cover SSO/MFA |
| 3 | Legacy overlay presentation | Separate live acceptance | Planned only if retained in release scope |

## Evidence required

- A regression should fail for the reproduced defect and pass for the fix. Do not add tests that merely repeat implementation details.
- Port scenarios and assertions from AEM and WordPress, then adapt them to Optimizely's actual routes, permissions and document lifecycle.
- Keep secret-free package/CMS tests required on PRs. A live failure must be reported separately as authentication, configuration, external-service or plugin behavior when evidence permits that distinction.
- An existing report belongs to the crawled public page. A future prepublish test must identify the temporary CMS draft in the actual handoff and verify a completed scan of that draft.
- Before release, review the exact candidate checksum, upgrade results and applicable live acceptance results. A green smoke test is not complete release approval.
