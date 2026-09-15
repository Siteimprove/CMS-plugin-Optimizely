import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import draft_release as release


class DraftReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.candidate = Path(self.temp.name)
        self.version = '4.3.4'
        self.commit = 'a' * 40
        self.filename = f'{release.PACKAGE}.{self.version}.nupkg'
        (self.candidate / self.filename).write_bytes(b'tested candidate')
        self.digest = hashlib.sha256(b'tested candidate').hexdigest()
        self.manifest = dict(package=self.filename, packageVersion=self.version,
                             sourceCommit=self.commit, workingTree=False, sha256=self.digest)
        self.save_manifest()
        (self.candidate / 'SHA256SUMS').write_text(f'{self.digest}  {self.filename}\n')
        (self.candidate / 'plugin.packages.lock.json').write_text('{}')

    def save_manifest(self):
        (self.candidate / 'manifest.json').write_text(json.dumps(self.manifest))

    def prepare(self):
        with patch.object(release, 'verify', return_value=self.digest):
            return release.prepare(self.candidate, self.candidate, self.version, self.commit,
                                   'https://github.com/example/plugin/actions/runs/1')

    def test_prepares_only_original_package_and_provenance_assets(self):
        assets, notes = self.prepare()
        self.assertEqual([p.name for p in assets], [self.filename, 'SHA256SUMS', 'manifest.json', 'plugin.packages.lock.json'])
        self.assertEqual(assets[0].read_bytes(), b'tested candidate')
        self.assertIn(self.commit, notes)
        self.assertIn(self.digest, notes)
        self.assertIn('Live reports are not covered', notes)

    def test_wrong_version_commit_or_working_tree_is_rejected(self):
        for field, value in [('packageVersion', '4.3.5'), ('sourceCommit', 'b' * 40),
                             ('workingTree', True), ('package', '../other.nupkg')]:
            with self.subTest(field=field):
                original = self.manifest[field]
                self.manifest[field] = value
                self.save_manifest()
                with self.assertRaises(ValueError):
                    self.prepare()
                self.manifest[field] = original
        self.save_manifest()

    def test_changed_checksum_is_rejected(self):
        (self.candidate / 'SHA256SUMS').write_text('wrong checksum\n')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.prepare()

    def test_failed_package_verification_prevents_release_preparation(self):
        with patch.object(release, 'verify', side_effect=ValueError('Damaged package')):
            with self.assertRaisesRegex(ValueError, 'Damaged package'):
                release.prepare(self.candidate, self.candidate, self.version, self.commit, 'run')

    def test_existing_draft_or_published_release_is_never_modified(self):
        for draft in [True, False]:
            with self.subTest(draft=draft), patch.object(release, 'api', return_value=[[], [{'tag_name': 'v4.3.4', 'draft': draft}]]), patch.object(release.subprocess, 'run') as run:
                with self.assertRaisesRegex(ValueError, 'already exists'):
                    release.create_draft('example/plugin', self.version, self.commit, [], 'notes')
                run.assert_not_called()

    def test_existing_tag_at_another_commit_is_rejected(self):
        refs = [{'ref': 'refs/tags/v4.3.4', 'object': {'type': 'commit', 'sha': 'b' * 40}}]
        with patch.object(release, 'api', side_effect=[[], refs]), patch.object(release.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'tested commit'):
                release.create_draft('example/plugin', self.version, self.commit, [], 'notes')
            run.assert_not_called()

    def test_api_failure_does_not_fall_through_to_creation(self):
        with patch.object(release, 'api', side_effect=subprocess.CalledProcessError(1, 'gh')), patch.object(release.subprocess, 'run') as run:
            with self.assertRaises(subprocess.CalledProcessError):
                release.create_draft('example/plugin', self.version, self.commit, [], 'notes')
            run.assert_not_called()

    def test_creates_a_draft_with_the_tested_commit_and_exact_assets(self):
        assets, notes = self.prepare()
        for kind in [None, 'commit', 'tag']:
            refs = [] if kind is None else [{'ref': 'refs/tags/v4.3.4', 'object': {'type': kind, 'sha': self.commit}}]
            responses = [[], refs]
            if kind == 'tag':
                responses.append({'object': {'type': 'commit', 'sha': self.commit}})
            def check_command(command, **kwargs):
                self.assertEqual(command[:4], ['gh', 'release', 'create', 'v4.3.4'])
                self.assertIn('--draft', command)
                self.assertNotIn('--clobber', command)
                self.assertEqual(command[command.index('--target') + 1], self.commit)
                self.assertEqual(command[-4:], list(map(str, assets)))
                self.assertEqual(Path(command[command.index('--notes-file') + 1]).read_text(), notes)
            with self.subTest(kind=kind), patch.object(release, 'api', side_effect=responses), patch.object(release.subprocess, 'run', side_effect=check_command) as run:
                release.create_draft('example/plugin', self.version, self.commit, assets, notes)
                run.assert_called_once()


if __name__ == '__main__':
    unittest.main()
