import os
import sys
import subprocess
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

    def test_live_configuration_failure_stops_before_starting_services(self):
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(sys, 'argv', ['cms_smoke.py', '--live']), \
                patch.object(cms_smoke.shutil, 'rmtree'), \
                patch.object(cms_smoke.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'node')) as run, \
                patch.object(cms_smoke.subprocess, 'Popen') as start:
            with self.assertRaises(subprocess.CalledProcessError):
                cms_smoke.main()
            self.assertEqual(run.call_args.args[0][0], 'node')
            start.assert_not_called()
