import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import cms_smoke


class LiveRunnerChecks(unittest.TestCase):
    def test_credentials_cannot_enter_stub_mode(self):
        with patch.dict(os.environ, {'SITEIMPROVE_PASSWORD': 'synthetic'}, clear=True), \
                patch.object(sys, 'argv', ['cms_smoke.py']), \
                patch.object(cms_smoke.subprocess, 'run') as run:
            with self.assertRaisesRegex(SystemExit, 'Do not supply live configuration'):
                cms_smoke.main()
            run.assert_not_called()

    def test_live_mode_requires_explicit_enablement_before_starting_services(self):
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(sys, 'argv', ['cms_smoke.py', '--live']), \
                patch.object(cms_smoke.subprocess, 'run') as run:
            with self.assertRaisesRegex(SystemExit, 'LIVE_TESTS_ENABLED'):
                cms_smoke.main()
            run.assert_not_called()
