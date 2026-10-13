"""Attach a verified candidate to a new, unpublished GitHub release."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile

from verify_package import PACKAGE, verify

ROOT = Path(__file__).resolve().parents[1]


def api(endpoint, *options):
    result = subprocess.run(['gh', 'api', endpoint, *options], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def prepare(candidate, source, version, commit, run_url):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Expected a release version and full source commit')
    manifest = json.loads((candidate / 'manifest.json').read_text())
    filename = f'{PACKAGE}.{version}.nupkg'
    if (manifest.get('package') != filename or manifest.get('packageVersion') != version
            or manifest.get('sourceCommit') != commit or manifest.get('workingTree') is not False):
        raise ValueError('Candidate must match the version and clean tested commit')
    package = candidate / filename
    digest = verify(package, source, version)
    checksum = f'{digest}  {filename}\n'
    if manifest.get('sha256') != digest or (candidate / 'SHA256SUMS').read_text() != checksum:
        raise ValueError('Candidate checksum mismatch')
    assets = [package, candidate / 'SHA256SUMS', candidate / 'manifest.json', candidate / 'plugin.packages.lock.json']
    if not all(path.is_file() and not path.is_symlink() for path in assets):
        raise ValueError('Missing or invalid release asset')
    notes = f'''## Candidate for review

Version: {version}
Source commit: `{commit}`
Validation: {run_url}
Package SHA-256: `{digest}`

The attached package passed functional tests, package-content checks, the two-profile CMS browser suite, and the 4.3.3-to-candidate package upgrade test with controlled Siteimprove responses. These are the tested package bytes; no rebuild was performed for this draft.

Before publishing, review release notes and upgrade evidence, then complete live Siteimprove acceptance. Live reports are not covered by the controlled-response suite. Publish the attached package to the package feed only after approval.
'''
    return assets, notes


def create_draft(repository, version, commit, assets, notes):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Invalid repository')
    tag = 'v' + version
    # Include drafts and every page so reruns never replace an existing candidate.
    releases = api(f'repos/{repository}/releases?per_page=100', '--paginate', '--slurp')
    if any(release['tag_name'] == tag for page in releases for release in page):
        raise ValueError(f'A release for {tag} already exists; review it before creating another candidate')
    refs = api(f'repos/{repository}/git/matching-refs/tags/{tag}')
    for ref in refs:
        if ref['ref'] != 'refs/tags/' + tag:
            continue
        obj = ref['object']
        for _ in range(10):
            if obj['type'] != 'tag':
                break
            obj = api(f"repos/{repository}/git/tags/{obj['sha']}")['object']
        if obj['type'] != 'commit' or obj['sha'] != commit:
            raise ValueError('Existing release tag does not point to the tested commit')
    with tempfile.TemporaryDirectory(prefix='release-notes-') as temp:
        path = Path(temp) / 'notes.md'
        path.write_text(notes)
        subprocess.run(['gh', 'release', 'create', tag, '--repo', repository,
                        '--draft', '--target', commit, '--title', f'v{version}',
                        '--notes-file', str(path), *map(str, assets)], check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--run-url', required=True)
    args = parser.parse_args()
    assets, notes = prepare(ROOT / 'artifacts/candidate', ROOT, args.version, args.commit, args.run_url)
    create_draft(args.repository, args.version, args.commit, assets, notes)


if __name__ == '__main__':
    main()
