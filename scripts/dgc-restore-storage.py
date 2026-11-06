"""Verify a downloaded DGC website backup; restore storage only into private artifacts.

Never executes backed-up source or restores environment variables. The live host is
not contacted. Both output directories must be new to avoid overwriting evidence.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile


def file_hash(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def safe_name(member):
    name = member.name
    path = PurePosixPath(name)
    if (path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name
            or not (member.isfile() or member.isdir()) or member.size < 0
            or any(p.rstrip(' .') != p for p in path.parts if p != '.')):
        raise ValueError('Unsafe backup member')
    if any(p.lower() == '.env' or p.lower().startswith('.env.') for p in path.parts):
        # .env.example is harmless source documentation, but is never extracted.
        if path.name != '.env.example':
            raise ValueError('Environment material is excluded from this drill')
    return path


def restore(archive, output, expected_hash):
    private = Path('artifacts').resolve(strict=True)
    archive, output = Path(archive).resolve(strict=True), Path(output).resolve()
    if (not archive.is_relative_to(private) or not output.is_relative_to(private)
            or output == private or output.exists()):
        raise ValueError('Use a downloaded archive and a NEW private artifacts directory')
    if archive.stat().st_size > 2 * 1024**3 or file_hash(archive) != expected_hash:
        raise ValueError('Downloaded archive size/hash differs')
    with tarfile.open(archive, 'r:*') as outer:
        members = outer.getmembers()
        if len(members) > 32:
            raise ValueError('Too many backup parts')
        names = {}
        for member in members:
            path = safe_name(member)
            if member.isfile():
                if str(path).casefold() in names:
                    raise ValueError('Duplicate backup part')
                names[str(path).casefold()] = member
        if 'manifest.json' not in names or names['manifest.json'].size > 1024**2:
            raise ValueError('Missing or oversized manifest')
        manifest = json.load(outer.extractfile(names['manifest.json']))
        if (manifest.get('format'), manifest.get('version'), manifest.get('project'),
                manifest.get('envIncluded')) != ('vays-website-backup', 1,
                {'name': 'Digicom-Erp', 'subdomain': 'digicom-erp'}, False):
            raise ValueError('Wrong project or environment included')
        parts = manifest.get('parts', [])
        if (len(parts) != 2 or sorted(p.get('kind') for p in parts) != ['appdata', 'source']
                or set(names) != {'manifest.json', *(p['file'].casefold() for p in parts)}):
            raise ValueError('Incomplete or unexpected backup parts')
        output.mkdir(parents=True)
        (output / 'parts').mkdir()
        (output / 'storage').mkdir()
        summaries = []
        for part in parts:
            member = names[part['file'].casefold()]
            if member.size != part['bytes'] or member.size > 2 * 1024**3:
                raise ValueError('Part size differs')
            if part['kind'] == 'appdata' and part.get('path') != '/app/storage':
                raise ValueError('Wrong persistent storage path')
            target = output / 'parts' / (part['kind'] + '.tar.gz')
            with target.open('xb') as dest, outer.extractfile(member) as source:
                shutil.copyfileobj(source, dest, 1024**2)
            if file_hash(target) != part['sha256']:
                raise ValueError('Part checksum differs')
            seen, files, total, inventory = set(), 0, 0, []
            with tarfile.open(target, 'r|*') as nested:
                for entry in nested:
                    path = safe_name(entry)
                    key = str(path).casefold()
                    if key in seen:
                        raise ValueError('Repeated normalized archive path')
                    seen.add(key)
                    total += entry.size
                    if len(seen) > 20000 or total > 4 * 1024**3 or entry.size > 64 * 1024**2:
                        raise ValueError('Nested archive exceeds bounds')
                    if not entry.isfile():
                        continue
                    files += 1
                    if part['kind'] != 'appdata':
                        continue
                    if path.name.startswith('.env'):
                        raise ValueError('Environment file in storage')
                    dest = output / 'storage' / Path(*path.parts)
                    if not dest.resolve().is_relative_to(output / 'storage'):
                        raise ValueError('Storage path escapes output')
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with nested.extractfile(entry) as source, dest.open('xb') as handle:
                        shutil.copyfileobj(source, handle, 1024**2)
                    if dest.stat().st_size != entry.size:
                        raise ValueError('Restored size differs')
                    inventory.append({'path': path.as_posix(), 'bytes': entry.size, 'sha256': file_hash(dest)})
            summaries.append({'kind': part['kind'], 'bytes': member.size, 'sha256': part['sha256'],
                              'entries': len(seen), 'files': files, 'unpackedBytes': total})
            if part['kind'] == 'appdata':
                (output / 'storage-inventory.json').write_text(json.dumps(inventory, indent=2), encoding='utf-8')
        proof = {'format': 'dgc-storage-restore-v1', 'archiveSha256': expected_hash,
                 'archiveBytes': archive.stat().st_size, 'createdAt': manifest.get('createdAt'),
                 'sourceCommit': next(p['commitSha'] for p in parts if p['kind'] == 'source'),
                 'parts': summaries, 'storageRestored': True, 'sourceExecuted': False,
                 'environmentRestored': False, 'remoteChanged': False,
                 'atomicBackup': False}
        (output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        (output / 'proof.json').write_text(json.dumps(proof, indent=2), encoding='utf-8')
        return proof


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ['archive', 'out', 'sha256']:
        parser.add_argument('--' + field, required=True)
    args = parser.parse_args()
    print(json.dumps(restore(args.archive, args.out, args.sha256)))
