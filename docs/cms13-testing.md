# CMS 13 candidate installation testing

Candidate: `5.0.0-alpha.8`. This is an experimental installation-test build, not a supported beta release. No release date is committed.

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
dotnet add path/to/CmsHost.csproj package SiteImprove.Optimizely.Plugin --version 5.0.0-alpha.8
```

Restore, build and publish the host into a clean directory. Check that its protected module ZIP and plugin assembly are present. Start CMS and confirm that both admin navigation and the author integration load without console or server errors.

Open Siteimprove from the CMS editor and sign in. Prepublish access follows the signed-in Siteimprove account's subscription and user permissions. No CMS API username/key, token entry or Prepublish activation is required. Connection setup is automatic; existing connection identifiers are reused. CMS settings only control public origin mappings and optional published-page rechecks. The v1 UI cannot be selected, including by an old saved preference.

Verify mappings before enabling rechecks. Mappings accept HTTP(S) origins with optional ports, without paths, queries, fragments or embedded credentials. Invalid or duplicate rows return an error and preserve all submitted values without saving. Clear both fields to remove a mapping.

## Asynchronous same-origin previews

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

- Test clean installation and upgrading an installation with existing settings. Confirm connection, recheck preference and URL mappings survive. Old API credentials are unused and cleared on the next settings save; a legacy v1 preference cannot change the SDK.
- Open the editor with no stored connection. Confirm setup is automatic and concurrent first requests share one request within the process. Change settings during setup and confirm they are retained.
- Save a blank replacement key and confirm the existing key remains usable.
- Verify author/admin access through actual HTTP routes, including denied content and antiforgery rejection.
- Test Siteimprove sign-out and account/subscription denial in the SDK. No CMS credential field or activation control should appear. Test malformed connection responses, timeout/cancellation, outage throttling and recovery without administrator setup.
- Disconnect/block Siteimprove temporarily. Editor resource loading must remain usable; asynchronous connection/status requests must finish within the configured timeout.
- Publish immediately and by schedule with rechecks enabled. Publication must not wait for Siteimprove. Verify accepted requests using logs and the Siteimprove account.
- Test retries and queue saturation in a controlled environment. A full queue is logged; it does not wait inside publishing.
- Verify the updated public page is available when rechecked. Configure a delivery delay if necessary; this delay is not proof that a headless frontend is ready.
- Restart CMS with pending requests. Pending requests are lost in this candidate; request a manual recheck afterwards.

The queue defaults to capacity 256, three attempts and a two-second retry delay. Hosts can configure `RecheckQueueOptions` through the service container. Requests are coalesced while pending for the same page/language. A new publication while a request is processing may enqueue another check.

## Rollback and feedback

Stop the test host, remove the candidate package reference and remove only the Siteimprove protected-module folder copied into the host project by installation. Restore the previous package/deployment, build and publish into a clean directory, and restart. Never remove other CMS modules. If a test included a CMS/database upgrade, restore the matching pre-test database and deployment together; removing the plugin does not reverse a CMS upgrade.

Report the exact candidate, environment, configuration, expected behaviour and reproduction steps, with sanitized console/server logs. Record which acceptance steps passed. Maintainers should nominate a feedback contact before inviting external testers.

A supported beta decision requires successful live installation and author-workflow results, resolved blocking findings, an agreed compatibility matrix and maintainer approval. Do not publish this candidate as a beta merely because its local tests pass.
