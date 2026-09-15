import io
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from verify_package import MODULE_FILES, PACKAGE, entries, verify


class PackageChecks(unittest.TestCase):
    def test_required_source_assets_exist_with_exact_case(self):
        root = Path(__file__).resolve().parents[2] / PACKAGE / f'modules/_protected/{PACKAGE}_files'
        self.assertEqual(MODULE_FILES, {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()})

    def test_invalid_packages_are_rejected(self):
        for name in ['../secret', '/absolute', 'missing.dll']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                path = Path(temp) / 'bad.nupkg'
                with zipfile.ZipFile(path, 'w') as z:
                    z.writestr(name, 'invalid')
                with self.assertRaises(ValueError):
                    verify(path, temp, '4.3.4')

    def test_case_collisions_are_rejected(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as z:
            z.writestr('module.config', '')
            z.writestr('Module.config', '')
        with zipfile.ZipFile(stream) as z, self.assertRaises(ValueError):
            entries(z)


if __name__ == '__main__':
    unittest.main()
