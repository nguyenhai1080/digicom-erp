import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('check', Path(__file__).with_name('dgc-storage-backup-check.py'))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
MARKER = {'id': '00000000-0000-4000-a000-000000000001', 'createdAt': '2026-10-23T00:00:00Z'}


def pack(entries):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w:gz') as tf:
        for name, data in entries:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
    return out.getvalue()


class BackupCheck(unittest.TestCase):
    def setUp(self):
        Path('artifacts').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='dgc-storage-test-', dir='artifacts')
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def run_check(self, mutate=lambda m: None, entries=None, marker_id=MARKER['id'], created_at=MARKER['createdAt'], bad_hash=False, output=None):
        source = pack([('source.js', b'// Synthetic inert fixture')])
        storage = pack(entries or [('vays-appdata/.erp-persistence-probe.json', json.dumps(MARKER).encode())])
        manifest = {'format': 'vays-website-backup', 'version': 1, 'project': {'name': 'Digicom-Erp', 'subdomain': 'digicom-erp'}, 'envIncluded': False, 'parts': [{'kind': 'source', 'file': 'source.tar.gz', 'bytes': len(source), 'sha256': hashlib.sha256(source).hexdigest(), 'commitSha': 'a'*40}, {'kind': 'appdata', 'file': 'appdata/storage.tar.gz', 'path': '/app/storage', 'bytes': len(storage), 'sha256': hashlib.sha256(storage).hexdigest()}]}
        mutate(manifest)
        data = pack([('manifest.json', json.dumps(manifest).encode()), ('source.tar.gz', source), ('appdata/storage.tar.gz', storage)])
        archive = self.root / 'backup.tar'
        archive.write_bytes(data)
        return check.verify_backup(archive, output or self.root / 'restore', marker_id, created_at, 'a'*40, '0'*64 if bad_hash else hashlib.sha256(data).hexdigest())

    def test_valid_roundtrip(self):
        proof = self.run_check()
        self.assertTrue(proof['localMarkerRestoreVerified'])
        self.assertEqual(json.loads((self.root/'restore/.erp-persistence-probe.json').read_bytes()), MARKER)
        self.assertFalse(proof['fullApplicationRestoreTested'])
        self.assertFalse(proof['financialDocumentRestoreTested'])

    def test_wrong_project(self):
        with self.assertRaisesRegex(ValueError, 'project'):
            self.run_check(lambda m: m['project'].update(name='GST'))

    def test_env_included(self):
        with self.assertRaisesRegex(ValueError, 'credentials'):
            self.run_check(lambda m: m.update(envIncluded=True))

    def test_outer_hash(self):
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.run_check(bad_hash=True)

    def test_part_hash(self):
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.run_check(lambda m: m['parts'][1].update(sha256='0'*64))

    def test_wrong_commit(self):
        with self.assertRaisesRegex(ValueError, 'commit'):
            self.run_check(lambda m: m['parts'][0].update(commitSha='b'*40))

    def test_wrong_mount(self):
        with self.assertRaisesRegex(ValueError, 'mount'):
            self.run_check(lambda m: m['parts'][1].update(path='/app/other'))

    def test_traversal(self):
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            self.run_check(entries=[('../.erp-persistence-probe.json', json.dumps(MARKER).encode())])

    def test_duplicate(self):
        with self.assertRaisesRegex(ValueError, 'repeated'):
            self.run_check(entries=[('a/.erp-persistence-probe.json', json.dumps(MARKER).encode()), ('b/.erp-persistence-probe.json', json.dumps(MARKER).encode())])

    def test_nested_env(self):
        with self.assertRaisesRegex(ValueError, 'credentials'):
            self.run_check(entries=[('.env', b'SYNTHETIC=fixture')])

    def test_marker_id(self):
        with self.assertRaisesRegex(ValueError, 'marker'):
            self.run_check(marker_id='different')

    def test_marker_date(self):
        with self.assertRaisesRegex(ValueError, 'marker'):
            self.run_check(created_at='2026-10-24T00:00:00Z')

    def test_missing_marker(self):
        with self.assertRaisesRegex(ValueError, 'marker'):
            self.run_check(entries=[('unrelated.txt', b'fixture')])

    def test_private_destination(self):
        with self.assertRaisesRegex(ValueError, 'private artifacts'):
            self.run_check(output=Path('not-private-fixture'))


if __name__ == '__main__':
    unittest.main()
