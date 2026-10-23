# CMS 13 candidate installation testing

Candidate: `5.0.0-alpha.11`. This is an experimental installation-test build, not a supported beta release. No release date is committed.

## Prepare the environment

Use a non-production CMS 13 installation with .NET 10, its database and platform services configured. Keep a database/settings backup and a copy of the current deployment. Provide an admin, an ordinary content author and an account without Siteimprove permissions.

Prepare representative pages, at least two languages, a draft containing known issues, and a Siteimprove test site/account with content-check access. The public site must be reachable by Siteimprove for published-page insights and crawls.

Start with a visible, server-rendered preview on the CMS origin. Cross-origin draft checks and highlighting are excluded. Multiple applications, custom headless routes and asynchronous frontends need separate verification.

Resolve the CMS host's dependency advisory warnings before external beta testing. The clean CMS 13.0 package fixture currently reports ImageSharp advisories requiring an Optimizely-compatible resolution; see the development status.

Record:

- CMS, .NET and browser versions.
- Plugin package version, source commit and package checksum.
- Siteimprove overlay version observed from `overlay-v2.js`.
- Applications, languages and preview configurations tested.

Do not put credentials, preview tokens, page HTML or confidential screenshots in public issues.

## Build and install

Run the README build/test commands, then create the candidate:

```sh
dotnet pack SiteImprove.Optimizely.Plugin/SiteImprove.Optimizely.Plugin.csproj -c Release -o artifacts/packages
```

Copy the package into a temporary local NuGet feed and add that feed to the host solution's development configuration. Keep that configuration outside version control. Install the exact candidate version in the CMS host project:

```sh
dotnet add path/to/CmsHost.csproj package SiteImprove.Optimizely.Plugin --version 5.0.0-alpha.11
```

Restore, build and publish the host into a clean directory. Check that its protected module ZIP and plugin assembly are present. Start CMS and confirm that both admin navigation and the author integration load without console or server errors.

Open Siteimprove from the CMS editor and sign in. Prepublish access follows the signed-in Siteimprove account's subscription and user permissions. No CMS API username/key, token entry or Prepublish activation is required. Connection setup is automatic; existing connection identifiers are reused. CMS settings only control public origin mappings. Publishing does not trigger automatic plugin rechecks. The v1 UI cannot be selected, including by an old saved preference.

Use Add mapping to create multiple rows before saving. Use Remove to delete a row, then save once to apply all changes. Mappings accept HTTP(S) origins with optional ports, without paths, queries, fragments or embedded credentials. Invalid or duplicate rows return an error and preserve all submitted values without saving. Removing a row updates the remaining field indexes before submission.

## Asynchronous same-origin previews

Before moving to a hosted environment, follow the [CSP and preview integration checks](cms13-csp.md). The isolated plugin fixtures pass a stricter policy than the complete CMS editor currently permits; platform and hosted SDK requirements must be tested separately.

The plugin waits for a matching URL, completed document/font loading and a quiet DOM. These checks cannot identify outstanding application data requests. An asynchronous frontend must explicitly hold checks until its selected draft is rendered:

```js
document.body.dataset.siteimprovePreviewReady = "false";
try {
    await renderSelectedDraft();
    document.body.dataset.siteimprovePreviewReady = "true";
} catch (error) {
    // Keep checking disabled if the render failed.
    showPreviewError(error);
}
```

Set the marker before every asynchronous update, including initial rendering, and associate completion with the current render request so an older request cannot mark a newer draft ready. A failed render should leave the marker false and explain the failure in the preview. This is a custom integration contract, not an Optimizely-provided API. A marker does not enable cross-origin DOM access.

## Author acceptance script

1. Select the prepared draft in Visual Builder. Verify that published-page insights refer to its correct public URL and language.
2. Confirm the check action appears only after its matching preview is visible and ready.
3. Run a real Siteimprove content check. Confirm it analyzes the draft rather than the published page.
4. Select element and text issues. Verify the correct content highlights and scrolls into view without altering authored markup.
5. Correct an issue. Verify old highlighting is cleared and a new check reflects the correction.
6. Change pages rapidly during preview loading and during a check. No previous page should be captured or highlighted as the new page.
7. Change language, draft version and viewport size. Verify context changes, unavailable states and stale-highlight protection.
8. Switch to All Properties with the preview hidden. The draft-check action should disappear; open the preview to re-enable it.
9. Select blocks/sections. Standalone checks are not yet supported; verify the guidance and record whether containing-page context needs improvement.
10. Open a cross-origin preview. Draft checking must be unavailable with an explanation. Test published-page insights separately where its public URL resolves.

Compare plugin highlights with actual Siteimprove results. The local browser fixtures test browser mechanics and simulated selectors; they do not validate the vendor's selector/text-offset contract.

## Admin, failure and publishing checks

- Test clean installation and upgrading an installation with existing settings. Confirm connection and URL mappings survive. Legacy automatic-recheck preferences are ignored and cleared on the next settings write. Old API credentials are unused and cleared on the next settings save; a legacy v1 preference cannot change the SDK.
- Open the editor with no stored connection. Confirm setup is automatic and concurrent first requests share one request within the process. Change settings during setup and confirm they are retained.
- Add several mappings without saving, remove a middle row and save. Reload and confirm that the remaining mappings retain their values. Remove all rows and save to clear the mappings.
- Verify author/admin access through actual HTTP routes, including denied content and antiforgery rejection.
- Test Siteimprove sign-out and account/subscription denial in the SDK. No CMS credential field or activation control should appear. Test malformed connection responses, timeout/cancellation, outage throttling and recovery without administrator setup.
- Disconnect/block Siteimprove temporarily. Editor resource loading must remain usable; asynchronous connection requests must finish within the configured timeout.
- Confirm immediate and scheduled publication do not enqueue or send plugin recheck requests, including when an installation has a legacy enabled preference.

## Repeatable HTTP acceptance checks

`tests/cms13-http-acceptance.py` exercises the installed plugin through real HTTP routes. Run it only on a non-production installation with disposable test accounts and pages. It performs a no-op settings save and submits an invalid mapping; it verifies that stored mappings remain unchanged.

Prepare four signed-in test sessions: `administrator`, `author`, `readOnly` and `unprivileged`. The administrator needs plugin settings access; the author needs plugin access and read/edit permission on the draft. The read-only editor needs plugin access and only Read permission on the published test page, without edit/create/publish rights. The unprivileged account must have no plugin role. The restricted page must allow the administrator and deny the other three accounts. Use a published Swedish variant as the second-language fixture.

Keep the session JSON outside the repository with owner-only file permissions. Its keys are the four session names above; each value is an object containing that session's cookie-name/value pairs. Obtain sessions through the host's normal test-account sign-in flow. Never use a production account or commit cookies. The fixture JSON contains `englishPublished`, `englishDraft`, `swedishPublished` and `restricted`, each holding its exact CMS content reference, including work IDs for version-specific fixtures.

```sh
python3 tests/cms13-http-acceptance.py \
  --base-url http://localhost:5013 \
  --sessions /private/path/sessions.json \
  --fixtures /private/path/fixtures.json \
  --expected-version 5.0.0-alpha.11 \
  --output /private/path/http-acceptance.json
```

Use `--module-path` when the protected module has a different URL prefix. The client sends `Accept-Encoding: gzip` and decodes gzip responses, matching the local Alloy host's browser routing behavior. Without that header, the local host returned 404 even for authorized administrator requests. The script requires a successful administrator/version positive control before treating negative results as evidence. Login/access-denied redirects must stay on the CMS host; 404 is never accepted as proof of access denial.

The 53 checks cover role/content permissions, published versus unpublished access, exact draft/language context, non-cacheable responses, invalid references/languages, settings validation and persistence, antiforgery rejection, anonymous denial and removed legacy actions. Output contains check names and booleans, without session values or page HTML. A passing local run does not verify Opti ID group mappings or Siteimprove subscription entitlement.

## Rollback and feedback

Stop the test host, remove the candidate package reference and remove only the Siteimprove protected-module folder copied into the host project by installation. Restore the previous package/deployment, build and publish into a clean directory, and restart. Never remove other CMS modules. If a test included a CMS/database upgrade, restore the matching pre-test database and deployment together; removing the plugin does not reverse a CMS upgrade.

Report the exact candidate, environment, configuration, expected behaviour and reproduction steps, with sanitized console/server logs. Record which acceptance steps passed. Maintainers should nominate a feedback contact before inviting external testers.

A supported beta decision requires successful live installation and author-workflow results, resolved blocking findings, an agreed compatibility matrix and maintainer approval. Do not publish this candidate as a beta merely because its local tests pass.
