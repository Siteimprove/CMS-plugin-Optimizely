"""Build one isolated candidate; never read a historical nupkg as the candidate."""
import argparse
import datetime
import json
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from verify_package import PACKAGE, verify

ROOT = Path(__file__).resolve().parents[1]


def run(*args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)


def output(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--working-tree', action='store_true', help='Include local edits; never use for release candidates')
    parser.add_argument('--release-version', default='')
    args = parser.parse_args()
    commit = output('git', 'rev-parse', 'HEAD')
    dirty = bool(output('git', 'status', '--porcelain'))
    if dirty and not args.working_tree:
        sys.exit('Working tree must be clean, or explicitly use --working-tree for local validation.')
    base = ET.parse(ROOT / PACKAGE / f'{PACKAGE}.csproj').findtext('./PropertyGroup/Version')
    if args.release_version and (args.working_tree or args.release_version != base):
        sys.exit('Release version must match the project version and use clean committed source.')
    identity = os.environ.get('GITHUB_RUN_ID', datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S'))
    attempt = os.environ.get('GITHUB_RUN_ATTEMPT', '1')
    version = args.release_version or f'{base}-ci.{identity}.{attempt}.g{commit[:12]}'
    out = ROOT / 'artifacts/candidate'
    if out.exists():
        sys.exit('artifacts/candidate already exists; move it aside before making another candidate.')
    out.mkdir(parents=True)
    with tempfile.TemporaryDirectory(prefix='cms-build-') as temp:
        source = Path(temp)
        paths = output('git', 'ls-files', '--cached', '--others', '--exclude-standard').splitlines()
        source_hashes = {}
        for name in paths:
            src = ROOT / name
            if src.is_file():
                dest = source / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)
                source_hashes[name] = hashlib.sha256(src.read_bytes()).hexdigest()
        project = str(source / PACKAGE / f'{PACKAGE}.csproj')
        run('dotnet', 'restore', project, '--locked-mode', cwd=source)
        run('dotnet', 'build', project, '-c', 'Release', '--no-restore',
            '-p:ContinuousIntegrationBuild=true', f'-p:Version={version}',
            f'-p:RepositoryCommit={commit}', f'-p:PackageOutputPath={out}', cwd=source)
        candidates = list(out.glob('*.nupkg'))
        if len(candidates) != 1:
            sys.exit('Expected exactly one newly built candidate')
        package = candidates[0]
        digest = verify(package, source, version)
        lock = json.loads((source / PACKAGE / 'packages.lock.json').read_text())
        manifest = {'sourceCommit': commit, 'workingTree': args.working_tree, 'packageVersion': version,
                    'package': package.name, 'sha256': digest, 'sdk': output('dotnet', '--version'),
                    'dependencies': lock['dependencies'],
                    'sourceFiles': source_hashes}
        (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (out / 'SHA256SUMS').write_text(f'{digest}  {package.name}\n')
        shutil.copy2(source / PACKAGE / 'packages.lock.json', out / 'plugin.packages.lock.json')
    print(f'Verified candidate {version}: {digest}')


if __name__ == '__main__':
    main()
