"""
Dependency injection — single source of truth for app-level singletons.

FastAPI's Depends() system pulls these into route handlers.
The actual instances are set during startup in main.py.
"""
from __future__ import annotations

from typing import Optional

from db.database import Database
from services.run_manager import RunManager

# Module-level singletons set by main.py on startup
_db: Optional[Database] = None
_run_manager: Optional[RunManager] = None
_registry = None
_graph = None


def set_db(db: Database) -> None:
    global _db
    _db = db


def set_run_manager(rm: RunManager) -> None:
    global _run_manager
    _run_manager = rm


def set_registry(reg) -> None:
    global _registry
    _registry = reg


def set_graph(g) -> None:
    global _graph
    _graph = g


# ── FastAPI dependency functions ──────────────────────────────────────────────

def get_db() -> Database:
    assert _db is not None, "Database not initialised"
    return _db


def get_run_manager() -> RunManager:
    assert _run_manager is not None, "RunManager not initialised"
    return _run_manager


def get_registry():
    assert _registry is not None, "Registry not initialised"
    return _registry


def get_graph():
    assert _graph is not None, "Graph not initialised"
    return _graph
