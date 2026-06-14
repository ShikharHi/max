"""
search_tool.py — SQLite-backed file search with rich metadata filters.
Used by the agent via search_files_tool().
"""

import json
import sqlite3
from pathlib import Path
from typing import Optional

from langchain_core.tools import tool

from scanner import DB_PATH, get_db, scan_user_folder, init_db


# ─────────────────────────────────────────────────────────────
# Core search function
# ─────────────────────────────────────────────────────────────

def search_files(
    name: Optional[str] = None,
    extension: Optional[str] = None,
    parent_dir: Optional[str] = None,
    is_dir: Optional[bool] = None,
    min_size_kb: Optional[float] = None,
    max_size_kb: Optional[float] = None,
    modified_after: Optional[str] = None,   # ISO date string e.g. "2024-01-01"
    modified_before: Optional[str] = None,
    mime_type: Optional[str] = None,
    mime_like: Optional[str] = None,         # e.g. "image" matches image/*
    owner_writable: Optional[bool] = None,
    depth_max: Optional[int] = None,
    limit: int = 50,
) -> list[dict]:
    """
    Search the file index with optional filters.
    Returns a list of metadata dicts.
    """
    if not DB_PATH.exists():
        return [{"error": "Index not found. Run the scanner first."}]

    clauses = []
    params: list = []

    if name is not None:
        clauses.append("name LIKE ?")
        params.append(f"%{name}%")

    if extension is not None:
        ext = extension if extension.startswith(".") else f".{extension}"
        clauses.append("extension = ?")
        params.append(ext.lower())

    if parent_dir is not None:
        clauses.append("parent_dir LIKE ?")
        params.append(f"%{parent_dir}%")

    if is_dir is not None:
        clauses.append("is_dir = ?")
        params.append(int(is_dir))

    if min_size_kb is not None:
        clauses.append("size_kb >= ?")
        params.append(min_size_kb)

    if max_size_kb is not None:
        clauses.append("size_kb <= ?")
        params.append(max_size_kb)

    if modified_after is not None:
        clauses.append("modified_at >= ?")
        params.append(modified_after)

    if modified_before is not None:
        clauses.append("modified_at <= ?")
        params.append(modified_before)

    if mime_type is not None:
        clauses.append("mime_type = ?")
        params.append(mime_type)

    if mime_like is not None:
        clauses.append("mime_type LIKE ?")
        params.append(f"{mime_like}%")

    if owner_writable is not None:
        clauses.append("owner_writable = ?")
        params.append(int(owner_writable))

    if depth_max is not None:
        clauses.append("depth <= ?")
        params.append(depth_max)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        SELECT path, name, extension, parent_dir,
               size_bytes, size_kb, size_mb,
               is_dir, mime_type, permissions,
               created_at, modified_at, accessed_at,
               depth
        FROM files
        {where}
        ORDER BY modified_at DESC
        LIMIT ?
    """
    params.append(limit)

    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()

    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────
# LangChain tool wrapper
# ─────────────────────────────────────────────────────────────

@tool
def search_files_tool(query: str) -> str:
    """
    Search the indexed file system using metadata filters.

    The `query` argument must be a JSON object (as a string) with any of these
    optional keys:

      name           (str)   — partial filename match (case-insensitive)
      extension      (str)   — file extension, e.g. ".py" or "py"
      parent_dir     (str)   — partial parent directory path match
      is_dir         (bool)  — true = directories only, false = files only
      min_size_kb    (float) — minimum file size in kilobytes
      max_size_kb    (float) — maximum file size in kilobytes
      modified_after (str)   — ISO date, e.g. "2024-06-01"
      modified_before(str)   — ISO date, e.g. "2024-12-31"
      mime_type      (str)   — exact MIME type, e.g. "text/plain"
      mime_like      (str)   — MIME prefix, e.g. "image" matches image/*
      owner_writable (bool)  — filter by write permission
      depth_max      (int)   — max directory depth from scan root
      limit          (int)   — max results to return (default 50)

    Examples:
      {"name": "report", "extension": "pdf"}
      {"mime_like": "image", "min_size_kb": 100}
      {"modified_after": "2024-01-01", "is_dir": false}
      {"parent_dir": "Documents", "max_size_kb": 500}
    """
    try:
        filters = json.loads(query)
    except json.JSONDecodeError:
        # Allow bare search by name
        filters = {"name": query}

    if not isinstance(filters, dict):
        filters = {"name": query}

    typed_filters: dict = {}

    if "name" in filters:
        typed_filters["name"] = filters["name"]
    if "extension" in filters:
        typed_filters["extension"] = filters["extension"]
    if "parent_dir" in filters:
        typed_filters["parent_dir"] = filters["parent_dir"]
    if "is_dir" in filters:
        typed_filters["is_dir"] = filters["is_dir"]
    if "min_size_kb" in filters:
        typed_filters["min_size_kb"] = filters["min_size_kb"]
    if "max_size_kb" in filters:
        typed_filters["max_size_kb"] = filters["max_size_kb"]
    if "modified_after" in filters:
        typed_filters["modified_after"] = filters["modified_after"]
    if "modified_before" in filters:
        typed_filters["modified_before"] = filters["modified_before"]
    if "mime_type" in filters:
        typed_filters["mime_type"] = filters["mime_type"]
    if "mime_like" in filters:
        typed_filters["mime_like"] = filters["mime_like"]
    if "owner_writable" in filters:
        typed_filters["owner_writable"] = filters["owner_writable"]
    if "depth_max" in filters:
        typed_filters["depth_max"] = filters["depth_max"]
    if "limit" in filters:
        typed_filters["limit"] = filters["limit"]

    results = search_files(**typed_filters)

    if not results:
        return "No files found matching the given filters."

    if len(results) == 1 and "error" in results[0]:
        return results[0]["error"]

    lines = [f"Found {len(results)} result(s):\n"]
    for r in results:
        kind = "📁 DIR " if r["is_dir"] else "📄 FILE"
        size = f"{r['size_kb']:.1f} KB" if not r["is_dir"] else "—"
        lines.append(
            f"  {kind}  {r['path']}\n"
            f"         size={size}  mime={r['mime_type'] or 'unknown'}"
            f"  modified={r['modified_at']}"
        )
    return "\n".join(lines)


@tool
def rescan_index_tool(root: str = "") -> str:
    """
    Re-scan the filesystem and rebuild the file index.
    Optionally pass a `root` path to scan a specific folder (default: home dir).
    Use this when you suspect the index is stale after file operations.
    """
    summary = scan_user_folder(root=root or None, verbose=False)
    return (
        f"✅ Scan complete for: {summary['root']}\n"
        f"   Files: {summary['files']:,}  |  Dirs: {summary['directories']:,}  "
        f"|  Errors: {summary['errors']}\n"
        f"   Scanned at: {summary['scanned_at']}"
    )


@tool
def index_stats_tool(dummy: str = "") -> str:
    """
    Return stats about the current file index (total files, dirs, largest files,
    most common extensions, last scan time).
    """
    if not DB_PATH.exists():
        return "Index not found. Run rescan_index_tool first."

    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        files = conn.execute("SELECT COUNT(*) FROM files WHERE is_dir=0").fetchone()[0]
        dirs  = conn.execute("SELECT COUNT(*) FROM files WHERE is_dir=1").fetchone()[0]
        last  = conn.execute("SELECT MAX(scanned_at) FROM files").fetchone()[0]

        top_ext = conn.execute("""
            SELECT extension, COUNT(*) as cnt
            FROM files WHERE is_dir=0 AND extension IS NOT NULL
            GROUP BY extension ORDER BY cnt DESC LIMIT 8
        """).fetchall()

        large = conn.execute("""
            SELECT name, size_mb, path
            FROM files WHERE is_dir=0
            ORDER BY size_bytes DESC LIMIT 5
        """).fetchall()

    ext_str = "  ".join(f"{r[0]}({r[1]})" for r in top_ext)
    large_str = "\n".join(f"    {r[1]:.2f} MB  {r[2]}" for r in large)

    return (
        f"📊 Index Stats\n"
        f"  Total entries : {total:,}\n"
        f"  Files         : {files:,}\n"
        f"  Directories   : {dirs:,}\n"
        f"  Last scanned  : {last}\n"
        f"\n  Top extensions: {ext_str}\n"
        f"\n  Largest files:\n{large_str}"
    )