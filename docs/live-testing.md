# Protected live report and prepublish tests

The manual **Live Siteimprove smoke test** workflow builds and tests a candidate, installs those exact bytes into a fresh disposable CMS, then opens the real overlay. Live tests run only on the newer CMS profile. It does not replace the overlay, manufacture report data or invoke its command queue from the test.

The first smoke test checks existing API entitlement, authenticates through the direct-login popup, opens the panel and requires an authenticated successful report response for the exact mapped public URL. The selectors and response contract follow the AEM/WordPress test approach; they still need confirmation with the first live account run. A second live scenario scans a persisted synthetic draft with a missing image alternative, saves a correction as a new draft revision, and scans again. Both checks must carry their distinct run markers, enter the running state, and return to the recheck control with the active-check indicator cleared. Live run 35017790911 passed the report and draft-handoff smoke checks. The suite now also requires the documented WCAG 1.1.1 Level A check, SIA-R2 (Image without a text alternative), before the fix and its absence in the visible accessibility results after the fix. These new result assertions still require live validation; they fail instead of skipping when the result cannot be found.

## Configure before enabling

Create the repository environment `siteimprove-test`. Restrict its deployment branches to `main` and require an appropriate reviewer before adding credentials. The workflow also rejects manual runs on other refs. These environment protections must be configured in GitHub; a YAML environment name alone does not create the restrictions.

Use a dedicated test account with access to the selected crawled page and existing Prepublish entitlement. Put these secrets in that environment, using the same names as AEM:

| Secret | Meaning |
| --- | --- |
| `SITEIMPROVE_USERNAME` | Direct-login Siteimprove test user |
| `SITEIMPROVE_PASSWORD` | Its password |
| `SITEIMPROVE_API_USERNAME` | API user with access to the test site |
| `SITEIMPROVE_API_KEY` | Its API key |
| `SITEIMPROVE_PUBLIC_URL` | Public Siteimprove site URL; its origin must match the crawled URL |
| `SITEIMPROVE_CRAWLED_URL` | Exact existing crawled page URL whose report should load |

No label variables or separate enable variable are needed. Live execution requires an explicit manual dispatch on `main`; the runner uses `--live` and the protected environment. Missing secrets fail the live step. Credentials are exposed only to the live runner step, after installation and dependency setup. Existing PR workflows do not receive them. No additional CMS password is needed: the runner generates temporary editor credentials.

The first flow supports Siteimprove direct login. SSO, MFA, consent and changed login screens fail the test and require a separate supported flow; the runner does not bypass them.

## The two URL spaces

The CMS runs at `http://localhost:5000`. Neither Siteimprove URL identifies that environment. For a synthetic example:

- CMS page: `http://localhost:5000/products/example/`
- Public site: `https://public.example.test/`
- Crawled page: `https://public.example.test/products/example/`

The fixture creates the same page path in the CMS and persists a public-origin mapping through the plugin settings repository. Before Siteimprove login, the test calls the installed plugin's PageUrl action and requires the exact crawled URL. It never substitutes a test URL into the overlay queue.

The initial fixture supports `/` or lowercase paths ending in `/`, with letters, numbers, hyphens and underscores. Query strings, fragments, custom route extensions and language prefixes need dedicated fixtures. Choose a genuinely crawled URL matching this shape. If CMS routing produces a different URL, the test fails; it does not rewrite the expected report address to obtain a pass.

Existing report content may differ from the synthetic CMS page. The report smoke proves lookup and authentication. The separate prepublish test verifies the synthetic CMS draft is different from the published page and passively observes its unique marker entering the real SDK. It clicks the real scan controls, checks loading-state exit and repeats after persisting an image-alternative correction. It does not replace the overlay or patch the browser DOM. Draft changes use a role-protected test-host endpoint backed by the CMS content repository; editing through the full CMS form and actual highlighting remain follow-ups in [the coverage plan](test-coverage-plan.md).

## Run and inspect

After this workflow is merged, choose **Actions → Live Siteimprove smoke test → Run workflow → main**. Complete the configured environment approval. The workflow runs functional and package/CMS tests before the live job; it neither creates a release nor publishes a package.

Only `live-smoke-outcome/result.json` is uploaded from the live run. It contains fixed test names, statuses, durations and the last allowlisted stage, HTTP status codes and known boolean readiness indicators. Traces, videos, screenshots, raw browser output, cookies, account URLs and report bodies are not uploaded. Host output is discarded in live mode, private browser output is removed, and the disposable database and identity keys are removed on normal completion or handled failure. An abrupt runner termination relies on disposal of the hosted runner.

The browser permits only localhost and HTTPS Siteimprove domains. A changed external login dependency therefore needs review. The CMS's live HTTP handler permits only token acquisition and entitlement reads, with redirects disabled. Automatic public-page rechecks remain disabled. The browser explicitly requests two prepublish scans of synthetic draft content; no public page is published, no remote settings are changed and no subscription is activated.

Do not pass live credentials to `test:cms`. The shared runner rejects Siteimprove configuration unless `--live` is explicitly selected. Keep live evidence separate from synthetic CMS evidence.

## Validation boundary

Unit tests verify configuration rejection, URL separation, report-readiness predicates, request-domain restrictions safe reporting, and marker isolation. Ordinary CMS CI validates six scenarios on each of the two locked CMS profiles, including persisted draft corrections and unchanged published content. Neither proves the real login selectors, live response schema, environment protections or the first live run. Those remain prerequisites before marking this smoke test operational or making it a release gate.

The earlier smoke baseline followed the [WordPress live runner](https://github.com/Siteimprove/CMS-plugin-Wordpress/blob/master/tests/live/run.js). The new active image-alternative assertions go beyond its skipped result check. The rule name and WCAG mapping come from [Siteimprove's documented checks](https://help.siteimprove.com/support/solutions/articles/80000448514) and [API check IDs](https://help.siteimprove.com/support/solutions/articles/80000448497). The fixture contains one synthetic image, with no alternative name before the fix and a persisted descriptive alternative afterward. No live page assets or report contents are copied into the repository.

After login, the test waits for authenticated report data for the mapped URL before opening the report panel, matching the WordPress flow. Diagnostic fields are independently filtered by the reporter; they contain no raw response fields, account text or URLs.

Report identity is checked against the exact `url` parameter on the SDK polling request. Like WordPress, the response must be authenticated, error-free, include a nonnegative numeric issue count and a nonempty `mainUrl`; that response field is not assumed to equal the crawled page URL.

The test opens the Accessibility results section before asserting the documented image-alternative rule. Safe result diagnostics report only whether the category, target issue, alert, running/recheck controls or nested frames are present/visible. Setup and result diagnostics are merged through the same allowlist; no result text or URLs are retained.
