"""Fetch the exact published package used as the upgrade baseline."""
import hashlib
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import zipfile

VERSION = '4.3.3'
SHA256 = '8085c7a352820155aa8afca37cd28b15b0d17dfe274d7e3be52659656147b1dc'
PACKAGE = 'SiteImprove.Optimizely.Plugin'
URL = f'https://nuget.optimizely.com/v3/package/{PACKAGE.lower()}/{VERSION}/{PACKAGE.lower()}.{VERSION}.nupkg'


def verify_baseline(path):
    if hashlib.sha256(path.read_bytes()).hexdigest() != SHA256:
        raise ValueError('Published baseline checksum changed')
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read(f'{PACKAGE}.nuspec'))
        ns = {'n': root.tag.split('}')[0][1:]}
        metadata = root.find('n:metadata', ns)
        if metadata.findtext('n:id', namespaces=ns) != PACKAGE or metadata.findtext('n:version', namespaces=ns) != VERSION:
            raise ValueError('Unexpected baseline package identity')
    return path


def download(root):
    folder = Path(root) / 'artifacts/baseline'
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'{PACKAGE}.{VERSION}.nupkg'
    if not path.exists():
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2',
                        '--max-time', '120', '--user-agent', 'NuGet Client V3/6.11.1', URL, '--output', str(path)], check=True)
    return verify_baseline(path)
