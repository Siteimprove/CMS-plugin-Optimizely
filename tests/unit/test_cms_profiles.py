import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from host import PROFILES


class CmsProfileChecks(unittest.TestCase):
    def test_each_profile_locks_its_actual_ui_and_core_versions(self):
        root = Path(__file__).resolve().parents[1] / 'CmsHost'
        for name, (ui, core, lockfile) in PROFILES.items():
            with self.subTest(profile=name):
                graph = {key.lower(): value for key, value in json.loads((root / lockfile).read_text())['dependencies']['net8.0'].items()}
                for package in ['EPiServer.CMS', 'EPiServer.CMS.UI', 'EPiServer.Cms.UI.AspNetIdentity']:
                    self.assertEqual(graph[package.lower()]['resolved'], ui)
                for package in ['EPiServer.CMS.Core', 'EPiServer.Hosting', 'EPiServer.CMS.AspNetCore.TagHelpers']:
                    self.assertEqual(graph[package.lower()]['resolved'], core)
