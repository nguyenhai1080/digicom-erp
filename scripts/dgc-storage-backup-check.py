"""Verify a DGC website backup and restore only its harmless storage probe locally."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile


def verify_backup(archive, output, marker_id, created_at, source_commit, archive_hash):
    archive = Path(archive).resolve(strict=True)
    root = Path('artifacts').resolve(strict=True)
    output = Path(output).resolve()
    if not archive.is_relative_to(root) or not output.is_relative_to(root) or output == root:
        raise ValueError('Evidence and restore output must remain in private artifacts')
    if archive.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('Backup exceeds bounded verification size')
    data = archive.read_bytes()
    actual_hash = hashlib.sha256(data).hexdigest()
    if actual_hash != archive_hash:
        raise ValueError('Downloaded backup checksum differs')

    def safe(member):
        path = PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or '\\' in member.name or not (member.isfile() or member.isdir()):
            raise ValueError('Unsafe archive member')
        if member.size < 0 or member.size > 64 * 1024 * 1024:
            raise ValueError('Archive member exceeds bounds')

    marker_bytes = None
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:*') as outer:
        members = outer.getmembers()
        if len(members) > 100:
            raise ValueError('Too many backup parts')
        for member in members:
            safe(member)
        files = {m.name: m for m in members if m.isfile()}
        if len(files) != len([m for m in members if m.isfile()]) or 'manifest.json' not in files or files['manifest.json'].size > 1024 * 1024:
            raise ValueError('Invalid backup manifest')
        manifest = json.load(outer.extractfile(files['manifest.json']))
        if (manifest.get('format'), manifest.get('version'), manifest.get('project'), manifest.get('envIncluded')) != ('vays-website-backup', 1, {'name': 'Digicom-Erp', 'subdomain': 'digicom-erp'}, False):
            raise ValueError('Wrong project or backup includes credentials')
        parts = manifest.get('parts', [])
        if len(parts) != 2 or sorted(p.get('kind') for p in parts) != ['appdata', 'source'] or set(files) != {'manifest.json', *(p['file'] for p in parts)}:
            raise ValueError('Incomplete or unexpected backup parts')
        verified = []
        for part in parts:
            member = files[part['file']]
            blob = outer.extractfile(member).read()
            if member.size != part['bytes'] or hashlib.sha256(blob).hexdigest() != part['sha256']:
                raise ValueError('Backup part size/checksum differs')
            if part['kind'] == 'source' and part.get('commitSha') != source_commit:
                raise ValueError('Backup source commit differs')
            if part['kind'] == 'appdata' and part.get('path') != '/app/storage':
                raise ValueError('Wrong storage mount')
            count, size, regular, seen = 0, 0, 0, set()
            with tarfile.open(fileobj=io.BytesIO(blob), mode='r|*') as nested:
                for entry in nested:
                    safe(entry)
                    count += 1
                    regular += int(entry.isfile())
                    size += entry.size
                    if count > 10000 or size > 256 * 1024 * 1024 or entry.name in seen:
                        raise ValueError('Nested archive exceeds bounds or repeats names')
                    seen.add(entry.name)
                    if PurePosixPath(entry.name).name == '.env':
                        raise ValueError('Unexpected credentials in downloaded archive')
                    if PurePosixPath(entry.name).name == '.erp-persistence-probe.json':
                        if part['kind'] != 'appdata' or marker_bytes is not None or not entry.isfile() or entry.size > 4096:
                            raise ValueError('Unexpected or repeated persistence marker')
                        marker_bytes = nested.extractfile(entry).read()
            verified.append({'kind': part['kind'], 'bytes': len(blob), 'sha256': part['sha256'], 'entries': count, 'regularFiles': regular})
    if marker_bytes is None or json.loads(marker_bytes) != {'id': marker_id, 'createdAt': created_at}:
        raise ValueError('Storage marker does not match both deployment observations')
    # No extractall: restore the single bounded marker to a new, isolated folder.
    output.mkdir(parents=True, exist_ok=False)
    restored = output / '.erp-persistence-probe.json'
    with restored.open('xb') as handle:
        handle.write(marker_bytes)
    if restored.read_bytes() != marker_bytes:
        raise ValueError('Restored storage bytes differ')
    proof = {'format': 'dgc-storage-backup-proof-v1', 'backupSha256': actual_hash, 'backupBytes': len(data), 'parts': verified, 'markerId': marker_id, 'markerCreatedAt': created_at, 'markerSha256': hashlib.sha256(marker_bytes).hexdigest(), 'localMarkerRestoreVerified': True, 'credentialsIncludedInDownload': False, 'fullApplicationRestoreTested': False, 'financialDocumentRestoreTested': False, 'remoteChangedByRestore': False}
    with (output / 'proof.json').open('x', encoding='utf-8') as handle:
        json.dump(proof, handle, indent=2)
    return proof


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ['archive', 'out', 'marker-id', 'created-at', 'source-commit', 'archive-hash']:
        parser.add_argument('--' + field, required=True)
    args = parser.parse_args()
    print(json.dumps(verify_backup(args.archive, args.out, args.marker_id, args.created_at, args.source_commit, args.archive_hash)))
