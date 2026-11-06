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

spec = importlib.util.spec_from_file_location('restore_storage', Path(__file__).with_name('dgc-restore-storage.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def pack(entries):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w:gz') as tar:
        for name, data, kind in entries:
            info = tarfile.TarInfo(name)
            if kind == 'link':
                info.type, info.linkname = tarfile.SYMTYPE, '../../outside'
                tar.addfile(info)
            else:
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
    return stream.getvalue()


class RestoreGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path('artifacts').resolve(), prefix='restore-guard-')
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def backup(self, entries=None, tenant='Digicom-Erp', env=False, tamper=False):
        source = pack([('README.md', b'synthetic source, never executed', 'file')])
        data = pack(entries or [('invoices/synthetic.pdf', b'%PDF-synthetic', 'file')])
        parts = [{'kind': 'source', 'file': 'source.tar.gz', 'bytes': len(source), 'sha256': hashlib.sha256(source).hexdigest(), 'commitSha': 'a'*40},
                 {'kind': 'appdata', 'file': 'storage.tar.gz', 'path': '/app/storage', 'bytes': len(data), 'sha256': ('0'*64 if tamper else hashlib.sha256(data).hexdigest())}]
        manifest = {'format': 'vays-website-backup', 'version': 1, 'project': {'name': tenant, 'subdomain': 'digicom-erp'}, 'envIncluded': env, 'parts': parts}
        target = self.root / 'backup.tar'
        target.write_bytes(pack([('manifest.json', json.dumps(manifest).encode(), 'file'), ('source.tar.gz', source, 'file'), ('storage.tar.gz', data, 'file')]))
        return target, module.file_hash(target)

    def reject(self, **kwargs):
        archive, sha = self.backup(**kwargs)
        with self.assertRaises(ValueError):
            module.restore(archive, self.root / 'restored', sha)

    def test_exact_bytes_and_source_never_extracted(self):
        archive, sha = self.backup()
        proof = module.restore(archive, self.root / 'restored', sha)
        self.assertEqual((self.root / 'restored/storage/invoices/synthetic.pdf').read_bytes(), b'%PDF-synthetic')
        self.assertFalse((self.root / 'restored/storage/README.md').exists())
        self.assertFalse(proof['sourceExecuted'])

    def test_path_escape(self):
        self.reject(entries=[('../outside', b'synthetic', 'file')])

    def test_windows_drive(self):
        self.reject(entries=[('C:/outside', b'synthetic', 'file')])

    def test_symlink(self):
        self.reject(entries=[('unsafe', b'', 'link')])

    def test_case_collision(self):
        self.reject(entries=[('one.pdf', b'a', 'file'), ('ONE.pdf', b'b', 'file')])

    def test_private_environment(self):
        self.reject(env=True)

    def test_wrong_tenant(self):
        self.reject(tenant='GST')

    def test_part_tamper(self):
        self.reject(tamper=True)

    def test_archive_pin(self):
        archive, _ = self.backup()
        with self.assertRaises(ValueError):
            module.restore(archive, self.root / 'restored', '0'*64)

    def test_existing_output(self):
        archive, sha = self.backup()
        with self.assertRaises(ValueError):
            module.restore(archive, self.root, sha)


if __name__ == '__main__':
    unittest.main()
