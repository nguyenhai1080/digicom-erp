"""Read original PDFs only. Paths/bytes are verified by the calling JS reader."""
import json
import hashlib
from io import BytesIO
import re
import sys
from pathlib import Path
import pypdf

sys.stdout.reconfigure(encoding="utf-8")
root = Path(sys.argv[1]).resolve(strict=True)
result = []
for file_id in sys.argv[2:]:
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,}", file_id):
        raise ValueError("Invalid file ID")
    path = root / (file_id + ".pdf")
    if path.is_symlink() or path.resolve(strict=True).parent != root:
        raise ValueError("PDF escaped evidence root")
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    try:
        reader = pypdf.PdfReader(BytesIO(data))
        result.append({"fileId": file_id, "sha256": sha, "pages": [page.extract_text(extraction_mode="layout") for page in reader.pages], "error": None})
    except Exception:
        result.append({"fileId": file_id, "sha256": sha, "pages": [], "error": "TEXT_EXTRACTION_FAILED"})
print(json.dumps({"tool": "pypdf", "version": pypdf.__version__, "mode": "layout", "files": result}, ensure_ascii=False))
