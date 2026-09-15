"""Negative controls against the actual candidate; each corruption must be rejected."""
import io
import json
from pathlib import Path
import shutil
import tempfile
import zipfile
from verify_package import PACKAGE, MODULE, MODULE_FILES, verify

ROOT = Path(__file__).resolve().parents[1]


def rewrite(data, transform):
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(out, 'w') as dest:
        for name in src.namelist():
            result = transform(name, src.read(name))
            if result is not None:
                dest.writestr(name, result)
    return out.getvalue()


def main():
    manifest = json.loads((ROOT / 'artifacts/candidate/manifest.json').read_text())
    data = (ROOT / 'artifacts/candidate' / manifest['package']).read_bytes()
    version = manifest['packageVersion']
    cases = {
        'missing DLL': rewrite(data, lambda n, d: None if n.endswith('.dll') else d),
        'wrong version': rewrite(data, lambda n, d: d.replace(version.encode(), b'0.0.0') if n.endswith('.nuspec') else d),
        'stale script': rewrite(data, lambda n, d: rewrite(d, lambda mn, md: md + b'\n// stale' if mn.endswith('.js') else md) if n.endswith('.zip') else d),
        'missing module file': rewrite(data, lambda n, d: rewrite(d, lambda mn, md: None if mn == 'module.config' else md) if n.endswith('.zip') else d),
    }
    extra = io.BytesIO(data)
    with zipfile.ZipFile(extra, 'a') as z:
        z.writestr('contentFiles/any/net6.0/appsettings.json', '{"Password":"not-a-real-secret"}')
    cases['unexpected settings file'] = extra.getvalue()
    with tempfile.TemporaryDirectory(prefix='bad-candidate-') as temp:
        path = Path(temp) / 'bad.nupkg'
        for name, broken in cases.items():
            path.write_bytes(broken)
            try:
                verify(path, ROOT, version)
            except ValueError:
                print('Rejected: ' + name)
            else:
                raise AssertionError('Verifier accepted ' + name)
        source = Path(temp) / 'source'
        shutil.copytree(ROOT / PACKAGE, source / PACKAGE, ignore=shutil.ignore_patterns('bin', 'obj'))
        (source / PACKAGE / f'modules/_protected/{PACKAGE}_files/module.config').unlink()
        path.write_bytes(data)
        try:
            verify(path, source, version)
        except ValueError:
            print('Rejected: missing module source file')
        else:
            raise AssertionError('Verifier accepted missing source file')


if __name__ == '__main__':
    main()
