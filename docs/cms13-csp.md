# CMS 13 CSP and preview integration

Checkpoint: 23 October 2026, `5.0.0-alpha.11`, CMS 13.0.0, .NET 10.0.13 and Chromium 153.0.8010.12. These checks do not establish compatibility with every CMS version, browser, authentication provider or hosting policy.

## Plugin checks

The preview fixture enforces this policy on the plugin's preview integration:

```text
default-src 'none';
script-src 'self';
style-src 'self';
style-src-attr 'none';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
frame-src 'self';
frame-ancestors 'self';
object-src 'none';
base-uri 'none';
form-action 'self'
```

The settings fixture uses the same script/style restrictions, allows same-origin form submissions and has no frames. There is no `unsafe-inline` or `unsafe-eval` exception in either fixture. They load the production plugin scripts and styles, with a simulated CMS/SDK context. They verify capture, element/text highlights, unchanged authored HTML, readable settings and mapping controls. Deliberately blocked and sandboxed previews cannot be captured and explain the browser security restriction. These fixtures do not load the complete Optimizely editor or hosted Siteimprove SDK.

The tests reproduced a blocked inline settings stylesheet before the fix. Alpha.11 moves it into the protected module's external `settings.css`, resolves its URL through CMS and removes the unused Google Fonts dependency. Its manually rendered script and stylesheet also reuse `ICspNonceService` when registered by the host. A second fixture enforces nonce-only script/style sources with `strict-dynamic` and no host allowlist; it failed before nonce propagation and now passes. Preview guidance also accounts for a security policy preventing DOM access on an otherwise local preview.

## Real CMS policy testing

The local host uses an enforced response header, rather than Report-Only, and Optimizely's `AddContentSecurityPolicyNonce`/`ICspNonceService` integration. A nonce must be generated once per request, reused for all resource rendering and included in that response's header. When checking raw HTML, decode attribute entities before comparing nonce values. Do not reuse a nonce across requests or cache a page independently of its CSP header.

The real settings page renders its external styles, adds/removes rows and saves with antiforgery protection under a nonce-based policy with no inline-script or inline-style exception. All 53 HTTP acceptance checks also pass with CSP enforced. This is functional evidence for the plugin, not a zero-violation claim for the surrounding CMS navigation. The final browser pass still reported blocked inline styles from Optimizely navigation (including `navigation.bundle.js` and an injected Font Awesome stylesheet). Review a platform-supported nonce/hash integration or narrowly scoped platform exceptions for those resources.

The full CMS 13.0.0 editor has additional platform requirements. Blocking `unsafe-eval` prevents the shipped Dojo loader from starting. Blocking dynamic inline style elements produces a Dojo parser error involving `deleteRule`. These are platform paths, not a new eval dependency in the plugin. A policy that works for the isolated plugin is therefore insufficient evidence that the complete editor works with it. Keep any required platform exceptions restricted to editor routes, and validate a stricter nonce-based integration with the selected Optimizely build before promising it to customers.

The working editor test profile allows its inline bootstrap scripts, inline style elements/attributes and `unsafe-eval`, while retaining explicit resource origins, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'self'`. This is a CMS-compatible policy, not evidence that the full editor passes the no-inline/no-eval fixture policy. The settings policy retains the stricter nonce configuration.

With that profile and the observed SDK origins allowed, the hosted Siteimprove panel opened and a fresh draft scan completed, returning 5 accessibility and 10 SEO issue types. The final editor/scan pass produced no reports in the temporary CSP collector; the subsequent strict settings pass produced the navigation style reports described above. Initial preview reports also identified Alloy's Bootstrap Icons CDN dependency; that belongs to the preview template's allowlist.

Browser CSP reports identified these additional origins in this installation:

| Directive | Observed resource | Source |
| --- | --- | --- |
| `script-src` | `https://cdn.siteimprove.net` | Siteimprove overlay loader |
| `connect-src` | `https://contentassistant.eu.siteimprove.com` (`/cms/poll`) | Siteimprove overlay; blocking this prevents opening the panel |
| `frame-src` | `https://contentassistant.eu.siteimprove.com` | Hosted Siteimprove panel |
| `style-src` | `https://fonts.googleapis.com` | Overlay and preview fonts |
| `font-src` | `https://fonts.gstatic.com`, `https://dhm5hy2vn8l0l.cloudfront.net` | Fonts used by this CMS/SDK installation |
| `style-src`, `font-src` | `https://cdn.jsdelivr.net` | Alloy's Bootstrap Icons; a preview-template dependency |

These are observed dependencies, not a permanent vendor contract or a universal allowlist. Regional tenants and other preview templates can differ. The temporary report collector strips query strings and preview tokens; raw report bodies are not retained or published.

## Demo-server acceptance

Configure CSP at the host or gateway; the plugin does not replace the application's policy. Review every enforced header and any CSP meta element, since multiple policies are cumulative.

- Allow the SDK script loaded from `https://cdn.siteimprove.net/cms/overlay-v2.js`. Account for the host's nonce/hash strategy when rendering scripts.
- Allow the actual Siteimprove panel origin in `frame-src`. Local testing uses `https://contentassistant.eu.siteimprove.com`; do not assume this is the only regional origin a customer may use.
- Keep the CMS preview on the CMS origin. Its `frame-ancestors`, `X-Frame-Options` and sandbox configuration must permit the intended embedding and DOM access.
- Confirm required browser connections, images, fonts and sign-in redirects from the deployed workflow. A server-side connection request is governed by server egress controls, not browser `connect-src`.
- Validate HTTPS, public URL mappings, proxy-forwarded scheme/host, draft identity, Opti ID and browser cookie restrictions. Do not cache authenticated draft or connection responses at the proxy.
- Run settings save/validation and a real draft scan, highlight, correction and recheck with the final enforced policy. Record browser violations and distinguish plugin, CMS, preview-template and hosted SDK sources.

Do not copy the fixture policy into a demo deployment unchanged or disable CSP to make the plugin load. No universal production allowlist has been established by these local tests.

## Optimizely APIs and the rendered DOM

CMS 13 exposes a [preview URL API](https://docs.optimizely.com/cms-13/api/get-preview-urls-for-a-content-item-version), `GET /_cms/v1/content/{key}/versions/{version}/previews`. It returns application/URL pairs with fresh authentication tokens, not rendered DOM. Preview tokens must be treated as credentials, and the documented API scope is `api:admin`.

The [content API](https://docs.optimizely.com/cms-13/api/introduction) exposes content data; a rich-text HTML value is not the fully rendered page. The [editor messaging API](https://docs.optimizely.com/cms-13/docs/publish-and-subscribe-messaging-system) reports context events. No supported complete rendered-DOM export was found in the reviewed CMS 13 documentation. The installed communication script also contains screenshot messaging; that implementation is not a documented DOM serialization or third-party highlighting contract.

Fetching a preview URL can retrieve server-rendered HTML. It does not reproduce client-side hydration, computed layout or a live DOM in the author's browser. It also does not grant the parent editor access across origins. Headless cross-origin checking still needs a supported frontend capture/highlight bridge with origin, sender and draft/revision validation, plus confirmation of the Siteimprove capture contract. It remains excluded from the initial beta.
