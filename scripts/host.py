"""Install an exact candidate into a fresh copy of the real CMS host."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import xml.etree.ElementTree as ET
from verify_package import PACKAGE, MODULE, verify

ROOT = Path(__file__).resolve().parents[1]


PROFILES = {
    'cms12-current': ('12.34.6', '12.24.0', 'packages.lock.json'),
    'cms12-2025': ('12.32.5', '12.22.6', 'locks/cms12-2025.json'),
}


def prepare(profile='cms12-current', baseline=False):
    ui_version, core_version, lock_path = PROFILES[profile]
    properties = [f'-p:CmsUiVersion={ui_version}', f'-p:CmsCoreVersion={core_version}']
    candidate = ROOT / 'artifacts/candidate'
    manifest = json.loads((candidate / 'manifest.json').read_text())
    version = manifest['packageVersion']
    if baseline:
        from upgrade_baseline import VERSION, download
        if version == VERSION:
            raise ValueError('Upgrade requires different baseline and candidate versions')
        package = download(ROOT)
        version = VERSION
        candidate = package.parent
    else:
        package = candidate / manifest['package']
        if verify(package, ROOT, version) != manifest['sha256']:
            raise ValueError('Candidate checksum mismatch')
    host = ROOT / ('artifacts/host-baseline' if baseline else 'artifacts/host')
    if host.exists():
        raise ValueError('artifacts/host already exists; move it aside before preparing a fresh host')
    shutil.copytree(ROOT / 'tests/CmsHost', host, ignore=shutil.ignore_patterns('bin', 'obj', 'modules', 'App_Data'))
    lock = json.loads((host / lock_path).read_text())
    lock['dependencies']['net8.0'][PACKAGE] = {
        'type': 'Direct', 'requested': f'[{version}, {version}]', 'resolved': version,
        'contentHash': base64.b64encode(hashlib.sha512(package.read_bytes()).digest()).decode(),
        'dependencies': {'EPiServer.CMS.UI.Core': '[12.0.2, 13.0.0)'}
    }
    (host / 'packages.lock.json').write_text(json.dumps(lock, indent=2) + '\n')
    config = ET.Element('configuration')
    sources = ET.SubElement(config, 'packageSources')
    ET.SubElement(sources, 'clear')
    for key, value in [('candidate', str(candidate)), ('nuget.org', 'https://api.nuget.org/v3/index.json'),
                       ('optimizely', 'https://nuget.optimizely.com/v3/index.json')]:
        ET.SubElement(sources, 'add', key=key, value=value)
    mapping = ET.SubElement(config, 'packageSourceMapping')
    for key, pattern in [('candidate', PACKAGE), ('nuget.org', '*'), ('optimizely', 'EPiServer.*')]:
        ET.SubElement(ET.SubElement(mapping, 'packageSource', key=key), 'package', pattern=pattern)
    ET.ElementTree(config).write(host / 'NuGet.config', encoding='utf-8', xml_declaration=True)
    env = dict(os.environ, NUGET_PACKAGES=str(ROOT / '.nuget-ci'))
    # No candidate from a shared cache can satisfy this restore.
    candidate_cache = ROOT / '.nuget-ci' / PACKAGE.lower()
    if candidate_cache.exists():
        shutil.rmtree(candidate_cache)
    subprocess.run(['dotnet', 'restore', 'CmsHost.csproj', '--locked-mode', '--configfile', 'NuGet.config',
                    f'-p:CandidateVersion={version}', *properties], cwd=host, env=env, check=True)
    subprocess.run(['dotnet', 'build', 'CmsHost.csproj', '-c', 'Release', '--no-restore',
                    f'-p:CandidateVersion={version}', *properties], cwd=host, env=env, check=True)
    import zipfile
    with zipfile.ZipFile(package) as z:
        if (host / MODULE).read_bytes() != z.read(f'contentFiles/any/net6.0/{MODULE}'):
            raise ValueError('Consumer targets did not install the exact module ZIP')
        if (host / f'bin/Release/net8.0/{PACKAGE}.dll').read_bytes() != z.read(f'lib/net6.0/{PACKAGE}.dll'):
            raise ValueError('Host does not contain the candidate DLL')
    subprocess.run(['dotnet', 'bin/Release/net8.0/CmsHost.dll', '--verify-package', version], cwd=host, env=env, check=True)
    evidence = ROOT / 'artifacts/evidence'
    evidence.mkdir(exist_ok=True)
    shutil.copy2(host / 'packages.lock.json', evidence / ('baseline.packages.lock.json' if baseline else 'host.packages.lock.json'))
    print('Host compiled; candidate DLL and consumer-installed module ZIP match exactly.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--profile', choices=PROFILES, default='cms12-current')
    parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    prepare(args.profile, args.baseline)
