"""
SQLite persistence layer for threads, runs, and assistants.

Uses aiosqlite for async access. Tables are created on startup.
The LangGraph SqliteSaver handles its own checkpoint tables;
this layer handles the REST-layer metadata only.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import aiosqlite

DB_PATH = Path(__file__).parent.parent / "jarvis.db"


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


class Database:
    """Thin async wrapper around aiosqlite for metadata persistence."""

    def __init__(self, path: Path = DB_PATH):
        self.path = path
        self._db: Optional[aiosqlite.Connection] = None

    async def connect(self) -> None:
        self._db = await aiosqlite.connect(self.path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA foreign_keys=ON")
        await self._create_tables()
        await self._seed_default_assistant()

    async def close(self) -> None:
        if self._db:
            await self._db.close()

    # ── Schema ────────────────────────────────────────────────────────────────

    async def _create_tables(self) -> None:
        assert self._db
        await self._db.executescript("""
            CREATE TABLE IF NOT EXISTS assistants (
                assistant_id TEXT PRIMARY KEY,
                graph_id     TEXT NOT NULL DEFAULT 'jarvis',
                name         TEXT NOT NULL,
                config       TEXT NOT NULL DEFAULT '{}',
                metadata     TEXT NOT NULL DEFAULT '{}',
                version      INTEGER NOT NULL DEFAULT 1,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS threads (
                thread_id     TEXT PRIMARY KEY,
                metadata      TEXT NOT NULL DEFAULT '{}',
                status        TEXT NOT NULL DEFAULT 'idle',
                thread_values TEXT,
                created_at    TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS runs (
                run_id       TEXT PRIMARY KEY,
                thread_id    TEXT REFERENCES threads(thread_id) ON DELETE CASCADE,
                assistant_id TEXT NOT NULL,
                status       TEXT NOT NULL DEFAULT 'pending',
                metadata     TEXT NOT NULL DEFAULT '{}',
                kwargs       TEXT NOT NULL DEFAULT '{}',
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_runs_thread ON runs(thread_id);
            CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
        """)
        await self._db.commit()

    async def _seed_default_assistant(self) -> None:
        """Ensure the default 'jarvis' assistant always exists."""
        assert self._db
        row = await (await self._db.execute(
            "SELECT 1 FROM assistants WHERE assistant_id = 'jarvis'"
        )).fetchone()
        if row is None:
            now = _now_iso()
            await self._db.execute(
                """INSERT INTO assistants (assistant_id, graph_id, name, config, metadata, version, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                ("jarvis", "jarvis", "JARVIS", "{}", "{}", 1, now, now),
            )
            await self._db.commit()

    # ── Assistants ────────────────────────────────────────────────────────────

    async def get_assistant(self, assistant_id: str) -> Optional[dict]:
        assert self._db
        row = await (await self._db.execute(
            "SELECT * FROM assistants WHERE assistant_id = ?", (assistant_id,)
        )).fetchone()
        return dict(row) if row else None

    async def list_assistants(self, limit: int = 10, offset: int = 0) -> list[dict]:
        assert self._db
        rows = await (await self._db.execute(
            "SELECT * FROM assistants ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )).fetchall()
        return [dict(r) for r in rows]

    async def create_assistant(self, data: dict) -> dict:
        assert self._db
        now = _now_iso()
        data.setdefault("assistant_id", str(uuid.uuid4()))
        data.setdefault("created_at", now)
        data.setdefault("updated_at", now)
        await self._db.execute(
            """INSERT INTO assistants (assistant_id, graph_id, name, config, metadata, version, created_at, updated_at)
               VALUES (:assistant_id, :graph_id, :name, :config, :metadata, :version, :created_at, :updated_at)""",
            {**data, "config": json.dumps(data.get("config", {})), "metadata": json.dumps(data.get("metadata", {}))},
        )
        await self._db.commit()
        return await self.get_assistant(data["assistant_id"])  # type: ignore

    async def delete_assistant(self, assistant_id: str) -> bool:
        assert self._db
        cur = await self._db.execute(
            "DELETE FROM assistants WHERE assistant_id = ?", (assistant_id,)
        )
        await self._db.commit()
        return cur.rowcount > 0

    # ── Threads ───────────────────────────────────────────────────────────────

    async def create_thread(self, thread_id: str, metadata: dict) -> dict:
        assert self._db
        now = _now_iso()
        await self._db.execute(
            "INSERT INTO threads (thread_id, metadata, status, thread_values, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (thread_id, json.dumps(metadata), "idle", None, now, now),
        )
        await self._db.commit()
        return await self.get_thread(thread_id)  # type: ignore

    async def get_thread(self, thread_id: str) -> Optional[dict]:
        assert self._db
        row = await (await self._db.execute(
            "SELECT * FROM threads WHERE thread_id = ?", (thread_id,)
        )).fetchone()
        if not row:
            return None
        d = dict(row)
        d["metadata"] = json.loads(d["metadata"] or "{}")
        d["values"] = json.loads(d["thread_values"]) if d["thread_values"] else None
        return d

    async def list_threads(self, limit: int = 20, offset: int = 0, status: Optional[str] = None) -> list[dict]:
        assert self._db
        if status:
            rows = await (await self._db.execute(
                "SELECT * FROM threads WHERE status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (status, limit, offset),
            )).fetchall()
        else:
            rows = await (await self._db.execute(
                "SELECT * FROM threads ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            )).fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["metadata"] = json.loads(d["metadata"] or "{}")
            d["values"] = json.loads(d["thread_values"]) if d["thread_values"] else None
            result.append(d)
        return result

    async def update_thread_status(self, thread_id: str, status: str, values: Optional[dict] = None) -> None:
        assert self._db
        if values is not None:
            await self._db.execute(
                "UPDATE threads SET status = ?, thread_values = ?, updated_at = ? WHERE thread_id = ?",
                (status, json.dumps(values), _now_iso(), thread_id),
            )
        else:
            await self._db.execute(
                "UPDATE threads SET status = ?, updated_at = ? WHERE thread_id = ?",
                (status, _now_iso(), thread_id),
            )
        await self._db.commit()

    async def update_thread_metadata(self, thread_id: str, metadata: dict) -> dict:
        assert self._db
        await self._db.execute(
            "UPDATE threads SET metadata = ?, updated_at = ? WHERE thread_id = ?",
            (json.dumps(metadata), _now_iso(), thread_id),
        )
        await self._db.commit()
        return await self.get_thread(thread_id)  # type: ignore

    async def delete_thread(self, thread_id: str) -> bool:
        assert self._db
        await self._db.execute("DELETE FROM runs WHERE thread_id = ?", (thread_id,))
        cur = await self._db.execute("DELETE FROM threads WHERE thread_id = ?", (thread_id,))
        await self._db.commit()
        return cur.rowcount > 0

    # ── Runs ──────────────────────────────────────────────────────────────────

    async def create_run(self, run_id: str, thread_id: Optional[str], assistant_id: str, metadata: dict, kwargs: dict) -> dict:
        assert self._db
        now = _now_iso()
        await self._db.execute(
            "INSERT INTO runs (run_id, thread_id, assistant_id, status, metadata, kwargs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (run_id, thread_id, assistant_id, "pending", json.dumps(metadata), json.dumps(kwargs), now, now),
        )
        await self._db.commit()
        return await self.get_run(run_id)  # type: ignore

    async def get_run(self, run_id: str) -> Optional[dict]:
        assert self._db
        row = await (await self._db.execute(
            "SELECT * FROM runs WHERE run_id = ?", (run_id,)
        )).fetchone()
        if not row:
            return None
        d = dict(row)
        d["metadata"] = json.loads(d["metadata"] or "{}")
        d["kwargs"] = json.loads(d["kwargs"] or "{}")
        return d

    async def list_runs(self, thread_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
        assert self._db
        rows = await (await self._db.execute(
            "SELECT * FROM runs WHERE thread_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (thread_id, limit, offset),
        )).fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["metadata"] = json.loads(d["metadata"] or "{}")
            d["kwargs"] = json.loads(d["kwargs"] or "{}")
            result.append(d)
        return result

    async def update_run_status(self, run_id: str, status: str) -> None:
        assert self._db
        await self._db.execute(
            "UPDATE runs SET status = ?, updated_at = ? WHERE run_id = ?",
            (status, _now_iso(), run_id),
        )
        await self._db.commit()

    async def cancel_run(self, run_id: str) -> bool:
        assert self._db
        row = await self.get_run(run_id)
        if not row or row["status"] not in ("pending", "running"):
            return False
        await self.update_run_status(run_id, "interrupted")
        return True

    async def get_active_run_for_thread(self, thread_id: str) -> Optional[dict]:
        assert self._db
        row = await (await self._db.execute(
            "SELECT * FROM runs WHERE thread_id = ? AND status IN ('pending','running') ORDER BY created_at ASC LIMIT 1",
            (thread_id,),
        )).fetchone()
        if not row:
            return None
        d = dict(row)
        d["metadata"] = json.loads(d["metadata"] or "{}")
        d["kwargs"] = json.loads(d["kwargs"] or "{}")
        return d
