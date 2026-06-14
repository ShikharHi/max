"""
scanner.py — Filesystem scanner that indexes all files and metadata into SQLite.
Run standalone or call scan_user_folder() programmatically.
"""

import os
import sqlite3
import stat
import time
import hashlib
import mimetypes
from pathlib import Path
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "file_index.db"


# ─────────────────────────────────────────────────────────────
# Database setup
# ─────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                path          TEXT UNIQUE NOT NULL,
                name          TEXT NOT NULL,
                extension     TEXT,
                parent_dir    TEXT,
                size_bytes    INTEGER,
                size_kb       REAL,
                size_mb       REAL,
                is_dir        INTEGER NOT NULL DEFAULT 0,
                is_symlink    INTEGER NOT NULL DEFAULT 0,
                mime_type     TEXT,
                permissions   TEXT,
                owner_readable  INTEGER,
                owner_writable  INTEGER,
                owner_executable INTEGER,
                created_at    TEXT,
                modified_at   TEXT,
                accessed_at   TEXT,
                depth         INTEGER,
                scanned_at    TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_name      ON files(name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_extension ON files(extension)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_parent    ON files(parent_dir)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_size      ON files(size_bytes)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_modified  ON files(modified_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_is_dir    ON files(is_dir)")
        conn.commit()
    logger.info("Database initialised at %s", DB_PATH)


# ─────────────────────────────────────────────────────────────
# Scanning logic
# ─────────────────────────────────────────────────────────────

def _permissions_str(mode: int) -> str:
    """Convert stat mode to rwx string, e.g. 'rw-r--r--'."""
    bits = [
        ("r", stat.S_IRUSR), ("w", stat.S_IWUSR), ("x", stat.S_IXUSR),
        ("r", stat.S_IRGRP), ("w", stat.S_IWGRP), ("x", stat.S_IXGRP),
        ("r", stat.S_IROTH), ("w", stat.S_IWOTH), ("x", stat.S_IXOTH),
    ]
    return "".join(c if mode & flag else "-" for c, flag in bits)


def _ts(epoch: float) -> str:
    return datetime.fromtimestamp(epoch).isoformat(timespec="seconds")


def _guess_mime(path: Path, is_dir: bool) -> Optional[str]:
    if is_dir:
        return "inode/directory"
    mime, _ = mimetypes.guess_type(str(path))
    return mime


def _depth(path: Path, root: Path) -> int:
    try:
        return len(path.relative_to(root).parts) - 1
    except ValueError:
        return -1


def scan_path(entry_path: Path, root: Path, scanned_at: str) -> Optional[dict]:
    """Build a metadata dict for one filesystem entry."""
    try:
        st = entry_path.stat(follow_symlinks=False)
    except (PermissionError, OSError):
        return None

    is_dir = stat.S_ISDIR(st.st_mode)
    is_sym = stat.S_ISLNK(st.st_mode)
    size = st.st_size if not is_dir else 0
    ext = entry_path.suffix.lower() if not is_dir else ""
    mime = _guess_mime(entry_path, is_dir)

    return {
        "path":              str(entry_path),
        "name":              entry_path.name,
        "extension":         ext or None,
        "parent_dir":        str(entry_path.parent),
        "size_bytes":        size,
        "size_kb":           round(size / 1024, 4),
        "size_mb":           round(size / (1024 ** 2), 6),
        "is_dir":            int(is_dir),
        "is_symlink":        int(is_sym),
        "mime_type":         mime,
        "permissions":       _permissions_str(st.st_mode),
        "owner_readable":    int(bool(st.st_mode & stat.S_IRUSR)),
        "owner_writable":    int(bool(st.st_mode & stat.S_IWUSR)),
        "owner_executable":  int(bool(st.st_mode & stat.S_IXUSR)),
        "created_at":        _ts(st.st_ctime),
        "modified_at":       _ts(st.st_mtime),
        "accessed_at":       _ts(st.st_atime),
        "depth":             _depth(entry_path, root),
        "scanned_at":        scanned_at,
    }


SKIP_DIRS = {
    ".git", "__pycache__", ".cache", ".local/share/Trash",
    "node_modules", ".venv", "venv", ".tox", "dist", "build",
    ".cargo/registry", ".rustup", "snap/",
}


def _should_skip(path: Path) -> bool:
    parts = set(path.parts)
    return bool(parts & SKIP_DIRS) or any(
        str(path).find(s) != -1 for s in SKIP_DIRS
    )


def scan_user_folder(
    root: Optional[str] = None,
    verbose: bool = True,
) -> dict:
    """
    Walk root (default: home dir) and upsert every entry into SQLite.
    Returns a summary dict.
    """
    init_db()
    root_path = Path(root).expanduser().resolve() if root else Path.home()
    scanned_at = datetime.now().isoformat(timespec="seconds")

    if verbose:
        print(f"\n🔍  Scanning: {root_path}")
        print(f"    Index  : {DB_PATH}\n")

    total = 0
    errors = 0
    batch: list[dict] = []
    BATCH_SIZE = 500

    def flush(batch):
        if not batch:
            return
        with get_db() as conn:
            conn.executemany("""
                INSERT INTO files (
                    path, name, extension, parent_dir,
                    size_bytes, size_kb, size_mb,
                    is_dir, is_symlink, mime_type,
                    permissions, owner_readable, owner_writable, owner_executable,
                    created_at, modified_at, accessed_at,
                    depth, scanned_at
                ) VALUES (
                    :path, :name, :extension, :parent_dir,
                    :size_bytes, :size_kb, :size_mb,
                    :is_dir, :is_symlink, :mime_type,
                    :permissions, :owner_readable, :owner_writable, :owner_executable,
                    :created_at, :modified_at, :accessed_at,
                    :depth, :scanned_at
                )
                ON CONFLICT(path) DO UPDATE SET
                    name=excluded.name,
                    extension=excluded.extension,
                    parent_dir=excluded.parent_dir,
                    size_bytes=excluded.size_bytes,
                    size_kb=excluded.size_kb,
                    size_mb=excluded.size_mb,
                    is_dir=excluded.is_dir,
                    is_symlink=excluded.is_symlink,
                    mime_type=excluded.mime_type,
                    permissions=excluded.permissions,
                    owner_readable=excluded.owner_readable,
                    owner_writable=excluded.owner_writable,
                    owner_executable=excluded.owner_executable,
                    created_at=excluded.created_at,
                    modified_at=excluded.modified_at,
                    accessed_at=excluded.accessed_at,
                    depth=excluded.depth,
                    scanned_at=excluded.scanned_at
            """, batch)
            conn.commit()

    # Walk the tree
    for dirpath, dirnames, filenames in os.walk(root_path, followlinks=False):
        dirpath_p = Path(dirpath)

        # Prune skipped dirs in-place
        dirnames[:] = [
            d for d in dirnames
            if not _should_skip(dirpath_p / d)
        ]

        # Index the directory itself
        rec = scan_path(dirpath_p, root_path, scanned_at)
        if rec:
            batch.append(rec)
            total += 1

        # Index files
        for fname in filenames:
            fpath = dirpath_p / fname
            rec = scan_path(fpath, root_path, scanned_at)
            if rec:
                batch.append(rec)
                total += 1
            else:
                errors += 1

        if len(batch) >= BATCH_SIZE:
            flush(batch)
            if verbose:
                print(f"  ✓  {total} entries indexed…", end="\r", flush=True)
            batch.clear()

    flush(batch)

    # Count summary
    with get_db() as conn:
        row = conn.execute("SELECT COUNT(*) as n FROM files WHERE is_dir=0").fetchone()
        file_count = row["n"]
        row = conn.execute("SELECT COUNT(*) as n FROM files WHERE is_dir=1").fetchone()
        dir_count = row["n"]

    summary = {
        "root": str(root_path),
        "total_entries": total,
        "files": file_count,
        "directories": dir_count,
        "errors": errors,
        "scanned_at": scanned_at,
        "db_path": str(DB_PATH),
    }

    if verbose:
        print(f"\n\n✅  Scan complete")
        print(f"    Files      : {file_count:,}")
        print(f"    Directories: {dir_count:,}")
        print(f"    Errors     : {errors}")
        print(f"    DB         : {DB_PATH}\n")

    return summary


# ─────────────────────────────────────────────────────────────
# Quick run
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    root = sys.argv[1] if len(sys.argv) > 1 else None
    scan_user_folder(root)