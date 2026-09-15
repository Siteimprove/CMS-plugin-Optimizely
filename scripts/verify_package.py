"""Check package paths and bytes independently of MSBuild's packing items."""
import hashlib
import io
from pathlib import Path, PurePosixPath
import re
import xml.etree.ElementTree as ET
import zipfile

PACKAGE = 'SiteImprove.Optimizely.Plugin'
MODULE_FILES = {
    'module.config',
    '1.0.5/ClientResources/Scripts/siteimprove.js',
    '1.0.5/ClientResources/Styles/styles.css',
    '1.0.5/ClientResources/Images/icon.svg',
}
MODULE = f'modules/_protected/{PACKAGE}/{PACKAGE}.zip'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def entries(archive):
    names = archive.namelist()
    require(len(names) == len(set(n.casefold() for n in names)), 'Duplicate or case-colliding paths')
    for n in names:
        require('\\' not in n and not n.startswith('/') and '..' not in PurePosixPath(n).parts,
                'Unsafe archive path')
    return {n for n in names if not n.endswith('/')}


def verify(path, source, version):
    source = Path(source) / PACKAGE
    with zipfile.ZipFile(path) as package:
        names = entries(package)
        required = {f'{PACKAGE}.nuspec', f'lib/net6.0/{PACKAGE}.dll', 'icon.png',
                    f'build/net6.0/{PACKAGE}.targets', f'content/{MODULE}',
                    f'contentFiles/any/net6.0/{MODULE}', '_rels/.rels', '[Content_Types].xml'}
        optional = {f'lib/net6.0/{PACKAGE}.runtimeconfig.json'}
        metadata = {n for n in names if re.fullmatch(r'package/services/metadata/core-properties/[a-f0-9]+\.psmdcp', n)}
        require(required <= names, 'Missing package files: ' + str(sorted(required - names)))
        require(not names - required - optional - metadata, 'Unexpected package files: ' + str(sorted(names - required - optional - metadata)))
        require(package.read(f'lib/net6.0/{PACKAGE}.dll').startswith(b'MZ'), 'Invalid DLL')
        require(package.read('icon.png') == (source / 'images/icon.png').read_bytes(), 'Stale icon')
        targets = package.read(f'build/net6.0/{PACKAGE}.targets')
        require(targets == (source / f'{PACKAGE}.targets').read_bytes(), 'Stale targets')
        require(b'contentFiles/any/net6.0/modules/_protected/' in targets, 'Wrong consumer asset path')
        root = ET.fromstring(package.read(f'{PACKAGE}.nuspec'))
        ns = {'n': root.tag.split('}')[0][1:]}
        metadata_node = root.find('n:metadata', ns)
        for key, value in {'id': PACKAGE, 'version': version, 'authors': 'SiteImprove',
                           'projectUrl': 'https://github.com/Siteimprove/CMS-plugin-Optimizely',
                           'icon': 'icon.png', 'description': 'Optimizely plugin from SiteImprove'}.items():
            require(metadata_node.findtext('n:' + key, namespaces=ns) == value, 'Wrong metadata: ' + key)
        dependencies = metadata_node.findall('n:dependencies/n:group/n:dependency', ns)
        require(len(dependencies) == 1 and dependencies[0].get('id') == 'EPiServer.CMS.UI.Core'
                and dependencies[0].get('version').replace(' ', '') == '[12.0.2,13.0.0)',
                'Consumer compatibility range changed')
        module_bytes = package.read(f'contentFiles/any/net6.0/{MODULE}')
        require(module_bytes == package.read(f'content/{MODULE}'), 'Module copies differ')
        module_source = source / f'modules/_protected/{PACKAGE}_files'
        actual_source = {p.relative_to(module_source).as_posix() for p in module_source.rglob('*') if p.is_file()}
        require(actual_source == MODULE_FILES, 'Missing or unexpected source module files')
        with zipfile.ZipFile(io.BytesIO(module_bytes)) as module:
            require(entries(module) == MODULE_FILES, 'Missing, extra, or mis-cased module files')
            for name in MODULE_FILES:
                require(module.read(name) == (module_source / name).read_bytes(), 'Stale module asset: ' + name)
            config = ET.fromstring(module.read('module.config'))
            require(config.get('clientResourceRelativePath') == '1.0.5', 'Wrong module version path')
            for resource in config.findall('./clientResources/add'):
                require('1.0.5/' + resource.get('path') in MODULE_FILES, 'Module references missing resource')
        # Only allowlisted files are packed. Also reject common credential material in text assets.
        for data in [targets, *[(module_source / n).read_bytes() for n in MODULE_FILES]]:
            require(not re.search(rb'-----BEGIN .*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}', data),
                    'Possible credential material in package')
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
