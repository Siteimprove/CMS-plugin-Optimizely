from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from upgrade_baseline import PACKAGE, VERSION, download, verify_baseline


class UpgradeBaselineChecks(unittest.TestCase):
    def test_changed_cached_package_is_rejected_without_redownload(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = root / 'artifacts/baseline'
            folder.mkdir(parents=True)
            package = folder / f'{PACKAGE}.{VERSION}.nupkg'
            package.write_bytes(b'changed package')
            with patch('upgrade_baseline.subprocess.run') as fetch:
                with self.assertRaisesRegex(ValueError, 'checksum changed'):
                    download(root)
                fetch.assert_not_called()

    def test_empty_download_cannot_be_used_as_baseline(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory) / 'empty.nupkg'
            package.touch()
            with self.assertRaisesRegex(ValueError, 'checksum changed'):
                verify_baseline(package)
