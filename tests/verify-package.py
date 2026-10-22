#!/usr/bin/env python3
"""Inspect a candidate package and optionally publish a clean consumer host."""
import argparse
import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT / 'SiteImprove.Optimizely.Plugin'
NAME = 'SiteImprove.Optimizely.Plugin'
MODULE = f'modules/_protected/{NAME}/{NAME}.zip'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def inspect(package):
    version = ET.parse(PROJECT / f'{NAME}.csproj').findtext('./PropertyGroup/Version')
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        require(f'lib/net10.0/{NAME}.dll' in names, 'Missing plugin assembly')
        require(f'buildTransitive/net10.0/{NAME}.targets' in names, 'Missing consumer build target')
        require('README.md' in names and 'icon.png' in names, 'Missing package metadata assets')
        require(archive.read('README.md') == (ROOT / 'README.md').read_bytes(), 'Packaged README differs from source')
        require(not any(Path(n).name.lower() in ('license.config', 'appsettings.json', 'credentials.json') for n in names),
                'Private host configuration must not be packaged')
        metadata = ET.fromstring(archive.read(f'{NAME}.nuspec'))
        ns = {'n': metadata.tag.split('}')[0].lstrip('{')}
        require(metadata.findtext('n:metadata/n:version', namespaces=ns) == version, 'Package version mismatch')
        module_path = f'contentFiles/any/net10.0/{MODULE}'
        with zipfile.ZipFile(io.BytesIO(archive.read(module_path))) as module:
            config = ET.fromstring(module.read('module.config'))
            require(config.get('clientResourceRelativePath') == version, 'Module resource version mismatch')
            sources = PROJECT / f'modules/_protected/{NAME}_files'
            expected = {p.relative_to(sources).as_posix(): p.read_bytes() for p in sources.rglob('*') if p.is_file()}
            actual = {n: module.read(n) for n in module.namelist() if not n.endswith('/')}
            require(actual == expected, 'Packaged client resources differ from source')
        return version, archive.read(module_path), archive.read(f'lib/net10.0/{NAME}.dll')


def publish_host(package, version, module, assembly):
    dotnet = os.environ.get('DOTNET_EXE', 'dotnet')
    with tempfile.TemporaryDirectory(prefix='cms13-package-') as directory:
        work = Path(directory)
        feed = work / 'feed'
        feed.mkdir()
        shutil.copy2(package, feed / package.name)
        host = work / 'host'
        host.mkdir()
        project = ET.Element('Project', Sdk='Microsoft.NET.Sdk.Web')
        ET.SubElement(ET.SubElement(project, 'PropertyGroup'), 'TargetFramework').text = 'net10.0'
        ET.SubElement(ET.SubElement(project, 'ItemGroup'), 'PackageReference', Include=NAME, Version=version)
        ET.ElementTree(project).write(host / 'PackageHost.csproj')
        (host / 'Program.cs').write_text('var app = Microsoft.AspNetCore.Builder.WebApplication.CreateBuilder(args).Build(); app.Run();\n')
        config = ET.parse(ROOT / 'NuGet.config')
        ET.SubElement(config.getroot().find('packageSources'), 'add', key='candidate', value=str(feed))
        config.write(work / 'NuGet.config')
        # Isolate the package cache so a previous candidate cannot mask changed bytes.
        env = dict(os.environ, NUGET_PACKAGES=str(work / 'packages'))
        subprocess.run([dotnet, 'restore', str(host / 'PackageHost.csproj'), '--configfile', str(work / 'NuGet.config')], env=env, check=True)
        output = work / 'published'
        subprocess.run([dotnet, 'publish', str(host / 'PackageHost.csproj'), '--no-restore', '-c', 'Release', '-o', str(output)], env=env, check=True)
        require((host / MODULE).read_bytes() == module, 'Consumer build did not copy the protected module')
        require((output / MODULE).read_bytes() == module, 'Publish output has a missing or different protected module')
        require((output / f'{NAME}.dll').read_bytes() == assembly, 'Publish output has a missing or different assembly')
        print('Clean consumer restore and publish passed (CMS services were not initialized).')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('--publish-host', action='store_true')
    args = parser.parse_args()
    package = args.package.resolve()
    version, module, assembly = inspect(package)
    print(f'Package inspection passed: {package.name}\nSHA256: {hashlib.sha256(package.read_bytes()).hexdigest()}', flush=True)
    if args.publish_host:
        publish_host(package, version, module, assembly)


if __name__ == '__main__':
    main()
