#!/usr/bin/env python3
"""Run access and settings checks against a non-production CMS using existing sessions."""
import argparse
import gzip
from html.parser import HTMLParser
import json
from pathlib import Path
from http.cookies import SimpleCookie
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


class SettingsForm(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.inputs = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == 'input':
            self.inputs.append(dict(attrs))

    def mappings(self):
        return {x['name']: x.get('value', '') for x in self.inputs if x.get('name', '').startswith('urlMap[')}

    def antiforgery(self):
        return next(x['value'] for x in self.inputs if x.get('name') == '__RequestVerificationToken')


class Session:
    def __init__(self, base, cookies=None):
        self.base = base
        self.cookies = dict(cookies or {})
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, path, data=None):
        # CMS 13 protected routes on the local Alloy host need a compression-capable client.
        headers = {'Accept-Encoding': 'gzip', 'User-Agent': 'cms13-acceptance',
                   'Cookie': '; '.join(k + '=' + v for k, v in self.cookies.items())}
        payload = None
        if data is not None:
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
            payload = urllib.parse.urlencode(data).encode()
        request = urllib.request.Request(self.base + path, payload, headers)
        try:
            response = self.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            for header in response.headers.get_all('Set-Cookie', []):
                cookie = SimpleCookie()
                cookie.load(header)
                self.cookies.update({k: value.value for k, value in cookie.items()})
            body = response.read()
            if response.headers.get('Content-Encoding') == 'gzip':
                body = gzip.decompress(body)
            return response.status, response.headers, body.decode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--module-path', default='/Optimizely/SiteImprove.Optimizely.Plugin')
    parser.add_argument('--sessions', required=True, type=Path,
                        help='Private JSON: author/administrator/readOnly/unprivileged, each with cookie-name:value pairs')
    parser.add_argument('--fixtures', required=True, type=Path,
                        help='Private JSON: englishPublished, englishDraft, restricted and swedishPublished content references')
    parser.add_argument('--expected-version', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    url = urllib.parse.urlsplit(args.base_url)
    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.query or url.fragment:
        parser.error('Use an HTTP(S) CMS base URL without sign-in details, query or fragment.')
    if not args.module_path.startswith('/') or args.module_path.startswith('//'):
        parser.error('The module path must start with one slash.')
    sessions = json.loads(args.sessions.read_text())
    fixtures = json.loads(args.fixtures.read_text())
    base = args.base_url.rstrip('/')
    module = args.module_path.rstrip('/')
    results = {}

    def check(name, condition):
        results[name] = bool(condition)
        print(('PASS ' if condition else 'FAIL ') + name, flush=True)

    def denied(status, headers):
        if status in (401, 403):
            return True
        destination = urllib.parse.urlsplit(headers.get('Location', ''))
        same_host = not destination.netloc or destination.netloc == url.netloc
        return status == 302 and same_host and destination.path.lower() in ('/util/login', '/util/accessdenied')

    def page(client, reference, language):
        return client.request(module + '/Siteimprove/PageUrl?' + urllib.parse.urlencode({'contentId': reference, 'locale': language}))

    admin = Session(base, sessions['administrator'])
    status, _, html = admin.request(module + '/SiteimproveAdmin')
    check('administrator settings positive control', status == 200 and args.expected_version in html)
    if not results['administrator settings positive control']:
        args.output.write_text(json.dumps(results, indent=2) + '\n')
        raise SystemExit('Positive control failed; denial checks would be inconclusive.')
    original = SettingsForm(html).mappings()
    check('legacy controls are absent', all(x.get('name') not in ('Recheck', 'Token', 'ApiUser', 'ApiKey', 'LatestUI') for x in SettingsForm(html).inputs))

    for role in ('author', 'administrator', 'readOnly', 'unprivileged'):
        client = Session(base, sessions[role])
        permitted = role != 'unprivileged'
        status, headers, _ = client.request(module + '/Siteimprove/Token')
        check(role + ' connection access', status == 200 if permitted else denied(status, headers))
        if permitted:
            check(role + ' connection response not cached', 'no-store' in headers.get('Cache-Control', ''))
        status, _, body = client.request(module + '/Siteimprove/IsAuthorized')
        check(role + ' authorization probe', status == 200 and json.loads(body) is True if permitted else status == 403)
        status, headers, body = page(client, fixtures['englishDraft'], 'en')
        check(role + ' draft context access', status == 200 if role in ('author', 'administrator') else denied(status, headers))
        if status == 200:
            data = json.loads(body)
            check(role + ' exact draft and language', data['language'] == 'en' and str(fixtures['englishDraft']) in data['previewUrl'])
            check(role + ' public URL excludes draft context', 'epieditmode' not in data['url'] and str(fixtures['englishDraft']) not in data['url'])
            check(role + ' page context not cached', 'no-store' in headers.get('Cache-Control', ''))
        status, headers, _ = page(client, fixtures['englishPublished'], 'en')
        check(role + ' published context access', status == 200 if permitted else denied(status, headers))
        status, headers, _ = page(client, fixtures['restricted'], 'en')
        check(role + ' restricted content', status == 200 if role == 'administrator' else denied(status, headers))
        status, headers, _ = client.request(module + '/SiteimproveAdmin')
        check(role + ' settings access', status == 200 if role == 'administrator' else denied(status, headers))
        if role == 'author':
            status, _, body = page(client, fixtures['swedishPublished'], 'sv')
            check('Swedish page context', status == 200 and json.loads(body)['language'] == 'sv')
            status, _, _ = page(client, 'not-a-reference', 'en')
            check('invalid reference rejected', status == 400)
            status, _, _ = page(client, fixtures['englishDraft'], '')
            check('missing language rejected', status == 400)
            status, _, _ = page(client, fixtures['englishDraft'], 'invalid|locale')
            check('invalid language rejected', status == 400)
            status, _, _ = page(client, '2147483647', 'en')
            check('missing content returns not found', status == 404)
            status, headers, _ = client.request(module + '/SiteimproveAdmin/Save', {})
            check('author cannot save settings', denied(status, headers))

    anonymous = Session(base)
    for action in ('Token', 'PageUrl?contentId=' + str(fixtures['englishDraft']) + '&locale=en'):
        status, headers, _ = anonymous.request(module + '/Siteimprove/' + action)
        check('anonymous denied ' + action.split('?')[0], denied(status, headers))
    status, _, _ = anonymous.request(module + '/Siteimprove/IsAuthorized')
    check('anonymous authorization probe denied', status == 403)

    status, _, html = admin.request(module + '/SiteimproveAdmin')
    form = SettingsForm(html)
    status, _, _ = admin.request(module + '/SiteimproveAdmin/Save', original)
    check('missing antiforgery rejected', status == 400)
    invalid = {'__RequestVerificationToken': form.antiforgery(), 'urlMap[0].Key': 'https://cms.example/path', 'urlMap[0].Value': 'https://public.example'}
    status, _, body = admin.request(module + '/SiteimproveAdmin/Save', invalid)
    check('invalid mapping returns validation', status == 200 and 'Your changes have not been saved.' in body)
    status, _, html = admin.request(module + '/SiteimproveAdmin')
    check('invalid mapping leaves stored settings intact', status == 200 and SettingsForm(html).mappings() == original)
    data = dict(original, __RequestVerificationToken=SettingsForm(html).antiforgery())
    status, headers, _ = admin.request(module + '/SiteimproveAdmin/Save', data)
    check('valid antiforgery save accepted', status == 302 and 'saved=True' in headers.get('Location', ''))
    status, _, html = admin.request(module + '/SiteimproveAdmin')
    check('settings retained after save', status == 200 and SettingsForm(html).mappings() == original)
    for action in ('RotateToken', 'EnablePrepublishCheck'):
        status, _, _ = admin.request(module + '/SiteimproveAdmin/' + action)
        check('removed action unavailable ' + action, status in (404, 405))
        status, _, _ = admin.request(module + '/SiteimproveAdmin/' + action,
                                    {'__RequestVerificationToken': SettingsForm(html).antiforgery()})
        check('removed action cannot be posted ' + action, status in (404, 405))
    args.output.write_text(json.dumps(results, indent=2) + '\n')
    if not all(results.values()):
        raise SystemExit('Acceptance checks failed; see the sanitized result file.')
    print(f'{len(results)} HTTP acceptance checks passed.')


if __name__ == '__main__':
    main()
